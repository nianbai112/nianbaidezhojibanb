package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type regionState struct {
	mu       sync.RWMutex
	snapshot *snapshot
}
type reader struct {
	config                                                   config
	client                                                   *http.Client
	regions                                                  map[string]*regionState
	budgetMu                                                 sync.Mutex
	cacheBytes                                               int64
	inflight                                                 chan struct{}
	refreshSlots                                             chan struct{}
	requests, rejected, authDenied, refreshOK, refreshFailed atomic.Uint64
}

func newReader(c config) (*reader, error) {
	if err := c.validate(); err != nil {
		return nil, err
	}
	transport := &http.Transport{Proxy: nil, DialContext: (&net.Dialer{Timeout: c.Timeout, KeepAlive: 30 * time.Second}).DialContext, MaxConnsPerHost: c.MaxInflight + 4, MaxIdleConnsPerHost: c.MaxInflight + 4, MaxIdleConns: c.MaxInflight + 4, IdleConnTimeout: 30 * time.Second, ResponseHeaderTimeout: c.Timeout, MaxResponseHeaderBytes: 16 << 10}
	r := &reader{config: c, client: &http.Client{Transport: transport, Timeout: c.Timeout, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, regions: map[string]*regionState{}, inflight: make(chan struct{}, c.MaxInflight), refreshSlots: make(chan struct{}, 4)}
	for _, id := range c.Regions {
		r.regions[id] = &regionState{}
	}
	return r, nil
}

// Requests never trigger a map read on the origin. Fixed, bounded refreshers
// prevent a cold-start or cache-expiry request storm from reaching the database.
func (r *reader) run(ctx context.Context) {
	var wg sync.WaitGroup
	for i, id := range r.config.Regions {
		wg.Add(1)
		go func(id string, offset time.Duration) {
			defer wg.Done()
			timer := time.NewTimer(offset)
			defer timer.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-timer.C:
				}
				select {
				case <-ctx.Done():
					return
				case r.refreshSlots <- struct{}{}:
				}
				err := r.refresh(ctx, id)
				<-r.refreshSlots
				if err != nil && ctx.Err() == nil {
					slog.Warn("map refresh failed", "region", id, "error", err.Error())
				}
				timer.Reset(r.config.Refresh)
			}
		}(id, time.Duration(i)*r.config.Refresh/time.Duration(len(r.config.Regions)))
	}
	wg.Wait()
	r.client.CloseIdleConnections()
}

func (r *reader) refresh(ctx context.Context, region string) (err error) {
	defer func() {
		if err != nil {
			r.refreshFailed.Add(1)
		} else {
			r.refreshOK.Add(1)
		}
	}()
	started := time.Now()
	endpoint := strings.TrimRight(r.config.Origin, "/") + "/campus-map/read-snapshot?regionId=" + url.QueryEscape(region)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Campus-Map-Read-Token", r.config.Token)
	req.Header.Set("Accept", "application/json")
	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("origin unavailable")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("origin status %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, r.config.MaxBody+1))
	if err != nil || int64(len(raw)) > r.config.MaxBody {
		return fmt.Errorf("snapshot read failed or oversized")
	}
	value, err := compileSnapshot(raw, region, started)
	if err != nil {
		return err
	}
	if time.Since(started) >= r.config.Lease {
		return fmt.Errorf("snapshot already expired")
	}
	state := r.regions[region]
	if state == nil {
		return fmt.Errorf("region not configured")
	}
	r.budgetMu.Lock()
	defer r.budgetMu.Unlock()
	state.mu.Lock()
	defer state.mu.Unlock()
	oldSize := int64(0)
	if state.snapshot != nil {
		oldSize = state.snapshot.size()
	}
	if r.cacheBytes-oldSize+value.size() > r.config.MaxCache {
		return fmt.Errorf("snapshot cache budget exceeded")
	}
	r.cacheBytes += value.size() - oldSize
	state.snapshot = value
	return nil
}

func (r *reader) current(region string) *snapshot {
	state := r.regions[region]
	if state == nil {
		return nil
	}
	state.mu.RLock()
	defer state.mu.RUnlock()
	value := state.snapshot
	if value == nil || time.Since(value.fetchedAt) >= r.config.Lease {
		return nil
	}
	return value
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if status == 429 || status == 503 {
		w.Header().Set("Retry-After", "2")
	}
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"code": status, "message": message, "data": nil})
}

func requestRegion(req *http.Request) (string, error) {
	query, err := url.ParseQuery(req.URL.RawQuery)
	if err != nil {
		return "", err
	}
	a, b := query["region_id"], query["regionId"]
	if len(a) > 1 || len(b) > 1 || (len(a) == 1 && len(b) == 1 && a[0] != b[0]) {
		return "", fmt.Errorf("ambiguous region")
	}
	id := "global"
	if len(a) == 1 && a[0] != "" {
		id = a[0]
	} else if len(b) == 1 && b[0] != "" {
		id = b[0]
	}
	if !regionPattern.MatchString(id) {
		return "", fmt.Errorf("invalid region")
	}
	return id, nil
}

func clientIP(req *http.Request) string {
	host, _, _ := net.SplitHostPort(req.RemoteAddr)
	ip := net.ParseIP(host)
	// Deployment snippet overwrites X-Real-IP; never trust client-supplied XFF.
	if ip != nil && ip.IsLoopback() {
		if forwarded := net.ParseIP(req.Header.Get("X-Real-IP")); forwarded != nil {
			return forwarded.String()
		}
	}
	if ip != nil {
		return ip.String()
	}
	return "unknown"
}

func (r *reader) authorize(req *http.Request) int {
	token := req.Header.Get("Authorization")
	if !strings.HasPrefix(token, "Bearer ") || len(token) <= 7 || len(token) > 8192 || len(req.Header.Values("Authorization")) != 1 {
		return http.StatusUnauthorized
	}
	check, err := http.NewRequestWithContext(req.Context(), http.MethodGet, strings.TrimRight(r.config.Origin, "/")+"/campus-map/read-access", nil)
	if err != nil {
		return http.StatusServiceUnavailable
	}
	check.Header.Set("Authorization", token)
	check.Header.Set("X-Campus-Map-Read-Token", r.config.Token)
	check.Header.Set("X-Forwarded-For", clientIP(req))
	check.Header.Set("X-Real-IP", clientIP(req))
	resp, err := r.client.Do(check)
	if err != nil {
		return http.StatusServiceUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 || resp.StatusCode == 403 || resp.StatusCode == 429 {
		return resp.StatusCode
	}
	if resp.StatusCode != 200 {
		return http.StatusServiceUnavailable
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4097))
	if err != nil || len(body) > 4096 {
		return http.StatusServiceUnavailable
	}
	var result struct {
		Allowed bool            `json:"allowed"`
		Code    json.RawMessage `json:"code"`
		Data    *struct {
			Allowed bool `json:"allowed"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &result) != nil || !((result.Data == nil && len(result.Code) == 0 && result.Allowed) || (successCode(result.Code) && result.Data != nil && result.Data.Allowed)) {
		return http.StatusServiceUnavailable
	}
	return http.StatusOK
}

func (r *reader) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Campus-Map-Service", "go-read-v1")
	if req.Method != http.MethodGet && req.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		writeError(w, 405, "只读地图服务不接受写入")
		return
	}
	if req.URL.Path == "/healthz" {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = io.WriteString(w, `{"status":"ok"}`)
		return
	}
	if req.URL.Path == "/readyz" {
		for _, id := range r.config.Regions {
			if r.current(id) == nil {
				writeError(w, 503, "地图数据尚未就绪或已过期")
				return
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = io.WriteString(w, `{"status":"ready"}`)
		return
	}
	if req.URL.Path == "/metrics" {
		r.metrics(w)
		return
	}
	path := strings.TrimPrefix(req.URL.Path, "/api")
	protected := path == "/campus-map/active" || path == "/campus-map/version"
	versionOnly := path == "/campus-map/version" || path == "/campus-map/site/version"
	if !protected && path != "/campus-map/site" && path != "/campus-map/site/version" {
		writeError(w, 404, "接口不存在")
		return
	}
	r.requests.Add(1)
	id, err := requestRegion(req)
	if err != nil {
		writeError(w, 400, "学校参数无效或重复")
		return
	}
	if r.regions[id] == nil {
		writeError(w, 404, "该学校尚未接入地图读取服务")
		return
	}
	select {
	case r.inflight <- struct{}{}:
		defer func() { <-r.inflight }()
	default:
		r.rejected.Add(1)
		writeError(w, 429, "地图访问繁忙，请稍后重试")
		return
	}
	if protected {
		if status := r.authorize(req); status != 200 {
			r.authDenied.Add(1)
			message := "地图身份校验暂不可用"
			if status == 401 || status == 403 {
				message = "登录已失效或账号不可用"
			}
			writeError(w, status, message)
			return
		}
	}
	value := r.current(id)
	if value == nil {
		writeError(w, 503, "暂时无法确认地图最新状态，请稍后重试")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-cache, must-revalidate")
	w.Header().Set("Vary", "Accept-Encoding, Authorization")
	w.Header().Set("X-Campus-Map-Age", strconv.Itoa(int(time.Since(value.fetchedAt).Seconds())))
	// Weak validators identify semantic content across gzip/identity and timestamps.
	etag := `W/"` + value.revision + `"`
	if versionOnly {
		etag = `W/"version-` + value.revision + `"`
	}
	w.Header().Set("ETag", etag)
	if req.Header.Get("If-None-Match") == etag {
		w.WriteHeader(304)
		return
	}
	body := value.body
	if versionOnly {
		body = value.version
	} else if acceptsGzip(req.Header.Get("Accept-Encoding")) {
		w.Header().Set("Content-Encoding", "gzip")
		body = value.compressed
	}
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	if req.Method != http.MethodHead {
		_, _ = w.Write(body)
	}
}

func acceptsGzip(value string) bool {
	for _, part := range strings.Split(value, ",") {
		fields := strings.Split(strings.TrimSpace(part), ";")
		if !strings.EqualFold(fields[0], "gzip") {
			continue
		}
		quality := 1.0
		for _, param := range fields[1:] {
			if key, val, ok := strings.Cut(strings.TrimSpace(param), "="); ok && strings.EqualFold(key, "q") {
				var err error
				quality, err = strconv.ParseFloat(val, 64)
				if err != nil {
					quality = 0
				}
			}
		}
		return quality > 0 && quality <= 1
	}
	return false
}

func (r *reader) metrics(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	w.Header().Set("Cache-Control", "no-store")
	fmt.Fprintf(w, "campus_map_requests_total %d\ncampus_map_rejected_total %d\ncampus_map_auth_denied_total %d\ncampus_map_refresh_success_total %d\ncampus_map_refresh_failed_total %d\n", r.requests.Load(), r.rejected.Load(), r.authDenied.Load(), r.refreshOK.Load(), r.refreshFailed.Load())
	r.budgetMu.Lock()
	size := r.cacheBytes
	r.budgetMu.Unlock()
	fmt.Fprintf(w, "campus_map_cache_bytes %d\n", size)
	for _, id := range r.config.Regions {
		ready := 0
		if r.current(id) != nil {
			ready = 1
		}
		fmt.Fprintf(w, "campus_map_region_ready{region=%q} %d\n", id, ready)
	}
}
