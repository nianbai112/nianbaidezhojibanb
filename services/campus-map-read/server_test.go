package main

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func testConfig(origin string) config {
	return config{Listen: "127.0.0.1:3002", Origin: origin, Token: "test-only-internal-snapshot-token-32", Regions: []string{"region-a", "global"}, Refresh: time.Second, Lease: 5 * time.Second, Timeout: 500 * time.Millisecond, MaxBody: 8 << 20, MaxCache: 64 << 20, MaxInflight: 64}
}

func fixture(region string, enabled bool, places string) string {
	return fmt.Sprintf(`{"code":200,"message":"success","timestamp":"volatile","data":{"enabled":%t,"regionId":%q,"workflow":{"activeVersionId":"version-16"},"publicPlaces":%s,"layers":[],"navigation":{"graph":{"edges":[]}}}}`, enabled, region, places)
}

func TestActualNestSuccessCodeAndMalformedCodes(t *testing.T) {
	for _, code := range []string{"0", "200", "null", `"0"`, "500", "false"} {
		t.Run(code, func(t *testing.T) {
			body := strings.Replace(fixture("region-a", true, "[]"), `"code":200`, `"code":`+code, 1)
			value, err := compileSnapshot([]byte(body), "region-a", time.Now())
			if code == "0" || code == "200" {
				if err != nil {
					t.Fatal(err)
				}
				if !strings.Contains(string(value.body), `"code":`+code) || !strings.Contains(string(value.version), `"code":`+code) {
					t.Fatal("response success code was changed")
				}
			} else if err == nil {
				t.Fatal("malformed/error code accepted")
			}
		})
	}
	body := strings.Replace(fixture("region-a", true, "[]"), `"code":200,`, "", 1)
	if _, err := compileSnapshot([]byte(body), "region-a", time.Now()); err == nil {
		t.Fatal("missing code accepted")
	}
}

func TestRealNestAccessEnvelope(t *testing.T) {
	for _, tc := range []struct {
		body   string
		status int
	}{
		{`{"code":0,"data":{"allowed":true}}`, 200},
		{`{"code":200,"data":{"allowed":true}}`, 200},
		{`{"allowed":true}`, 200},
		{`{"code":null,"data":{"allowed":true}}`, 503},
		{`{"data":{"allowed":true}}`, 503},
		{`{"code":500,"data":{"allowed":true}}`, 503},
		{`{"code":0,"data":{"allowed":false}}`, 503},
		{`{"code":"0","data":{"allowed":true}}`, 503},
		{`{"code":null,"allowed":true}`, 503},
	} {
		t.Run(tc.body, func(t *testing.T) {
			origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) { _, _ = io.WriteString(w, tc.body) }))
			defer origin.Close()
			r, err := newReader(testConfig(origin.URL))
			if err != nil {
				t.Fatal(err)
			}
			defer r.client.CloseIdleConnections()
			req := httptest.NewRequest("GET", "/campus-map/active", nil)
			req.Header.Set("Authorization", "Bearer test-user")
			if got := r.authorize(req); got != tc.status {
				t.Fatalf("got %d, want %d", got, tc.status)
			}
		})
	}
}

type originFixture struct {
	server              *httptest.Server
	mapCalls, authCalls atomic.Int64
	authStatus          atomic.Int64
	mu                  sync.Mutex
	content             string
	token, forwarded    string
}

func newFixture(t *testing.T) (*reader, *originFixture) {
	t.Helper()
	o := &originFixture{content: fixture("region-a", true, `[{"id":"north-gate"}]`)}
	o.authStatus.Store(200)
	o.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		switch req.URL.Path {
		case "/campus-map/read-snapshot":
			o.mapCalls.Add(1)
			o.mu.Lock()
			defer o.mu.Unlock()
			o.token = req.Header.Get("X-Campus-Map-Read-Token")
			if req.Header.Get("Authorization") != "" {
				t.Error("snapshot must not inherit user identity")
			}
			_, _ = io.WriteString(w, o.content)
		case "/campus-map/read-access":
			if req.Header.Get("X-Campus-Map-Read-Token") != "test-only-internal-snapshot-token-32" {
				t.Error("auth check lacks internal service credential")
			}
			o.authCalls.Add(1)
			o.mu.Lock()
			o.forwarded = req.Header.Get("X-Forwarded-For")
			o.mu.Unlock()
			w.WriteHeader(int(o.authStatus.Load()))
			_, _ = io.WriteString(w, `{"code":200,"data":{"allowed":true}}`)
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(o.server.Close)
	r, err := newReader(testConfig(o.server.URL))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(r.client.CloseIdleConnections)
	return r, o
}

func call(r *reader, path, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("GET", path, nil)
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func warm(t *testing.T, r *reader) {
	t.Helper()
	if err := r.refresh(context.Background(), "region-a"); err != nil {
		t.Fatal(err)
	}
}

func TestColdStartDoesNotAmplifyOrigin(t *testing.T) {
	r, o := newFixture(t)
	for i := 0; i < 100; i++ {
		if w := call(r, "/campus-map/site?regionId=region-a", ""); w.Code != 503 {
			t.Fatalf("got %d", w.Code)
		}
	}
	if o.mapCalls.Load() != 0 {
		t.Fatal("cold visitors triggered origin requests")
	}
}

func TestWarmSnapshotHandlesConcurrentVisitorsWithoutMapQueries(t *testing.T) {
	r, o := newFixture(t)
	warm(t, r)
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 10; j++ {
				w := call(r, "/api/campus-map/site?region_id=region-a", "")
				if w.Code != 200 && w.Code != 429 {
					t.Errorf("got %d", w.Code)
				}
			}
		}()
	}
	wg.Wait()
	if o.mapCalls.Load() != 1 {
		t.Fatalf("map reads=%d", o.mapCalls.Load())
	}
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.token != r.config.Token {
		t.Fatal("internal token missing")
	}
}

func TestAuthenticationIsNotCachedOrBypassedByETag(t *testing.T) {
	r, o := newFixture(t)
	warm(t, r)
	if w := call(r, "/campus-map/active?regionId=region-a", ""); w.Code != 401 {
		t.Fatalf("anonymous=%d", w.Code)
	}
	w := call(r, "/campus-map/active?regionId=region-a", "Bearer test")
	if w.Code != 200 {
		t.Fatal(w.Code)
	}
	o.authStatus.Store(401)
	req := httptest.NewRequest("GET", "/campus-map/active?regionId=region-a", nil)
	req.Header.Set("Authorization", "Bearer test")
	req.Header.Set("If-None-Match", w.Header().Get("ETag"))
	out := httptest.NewRecorder()
	r.ServeHTTP(out, req)
	if out.Code != 401 {
		t.Fatal("revoked login obtained cached response", out.Code)
	}
	if o.authCalls.Load() != 2 {
		t.Fatal("auth result cached")
	}
}

func TestAuthStatusesAndMalformedSuccessFailClosed(t *testing.T) {
	for _, status := range []int{401, 403, 429, 500, 302} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			r, o := newFixture(t)
			warm(t, r)
			o.authStatus.Store(int64(status))
			expected := status
			if status >= 500 || status == 302 {
				expected = 503
			}
			if w := call(r, "/campus-map/active?regionId=region-a", "Bearer test"); w.Code != expected {
				t.Fatal(w.Code)
			}
		})
	}
	t.Run("HTML is not auth success", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, "login page") }))
		defer server.Close()
		r, _ := newReader(testConfig(server.URL))
		if w := call(r, "/campus-map/active?regionId=region-a", "Bearer test"); w.Code != 503 {
			t.Fatal(w.Code)
		}
	})
}

func TestFreshnessExpiresWithoutStaleFallback(t *testing.T) {
	r, o := newFixture(t)
	warm(t, r)
	s := r.regions["region-a"]
	s.mu.Lock()
	s.snapshot.fetchedAt = time.Now().Add(-r.config.Lease - time.Second)
	s.mu.Unlock()
	if w := call(r, "/campus-map/site?regionId=region-a", ""); w.Code != 503 || strings.Contains(w.Body.String(), "north-gate") {
		t.Fatal("expired route leaked")
	}
	if o.mapCalls.Load() != 1 {
		t.Fatal("request retried origin")
	}
}

func TestWithdrawalChangesRevisionWithinSamePublishedVersion(t *testing.T) {
	r, o := newFixture(t)
	warm(t, r)
	before := call(r, "/campus-map/site?regionId=region-a", "")
	o.mu.Lock()
	o.content = fixture("region-a", true, `[]`)
	o.mu.Unlock()
	warm(t, r)
	after := call(r, "/campus-map/site?regionId=region-a", "")
	if before.Header().Get("ETag") == after.Header().Get("ETag") || strings.Contains(after.Body.String(), "north-gate") {
		t.Fatal("withdrawal not reflected")
	}
	o.mu.Lock()
	o.content = fixture("region-a", false, `[]`)
	o.mu.Unlock()
	warm(t, r)
	if w := call(r, "/campus-map/site?regionId=region-a", ""); !strings.Contains(w.Body.String(), `"enabled":false`) {
		t.Fatal("disabled state lost")
	}
}

func TestRevisionIgnoresEnvelopeTimestamp(t *testing.T) {
	a, err := compileSnapshot([]byte(fixture("region-a", true, `[]`)), "region-a", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	b, err := compileSnapshot([]byte(strings.ReplaceAll(fixture("region-a", true, `[]`), "volatile", "different-time")), "region-a", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if a.revision != b.revision {
		t.Fatal("timestamp causes false content changes")
	}
}

func TestSnapshotValidation(t *testing.T) {
	for _, body := range []string{`<html>login</html>`, `{"code":401,"data":{"enabled":false,"regionId":"region-a"}}`, fixture("wrong-region", true, `[]`), `{"enabled":true,"regionId":"region-a"}`, `{"enabled":false,"regionId":"region-a","draft":{}}`} {
		if _, err := compileSnapshot([]byte(body), "region-a", time.Now()); err == nil {
			t.Fatalf("accepted invalid data %s", body)
		}
	}
}

func TestRoutesRegionsMethodsAndParameterPollution(t *testing.T) {
	r, _ := newFixture(t)
	warm(t, r)
	for _, row := range []struct {
		path string
		code int
	}{
		{"/campus-map/site?regionId=region-a", 200}, {"/campus-map/site?region_id=region-a", 200},
		{"/admin/campus-map/region-a/publish", 404}, {"/campus-map/read-snapshot", 404},
		{"/campus-map/site?regionId=unknown", 404}, {"/campus-map/site?regionId=region-a&regionId=region-a", 400},
		{"/campus-map/site?regionId=region-a&region_id=global", 400}, {"/campus-map/site?regionId=http://evil", 400},
		{"/campus-map/site?regionId=%zz", 400},
	} {
		if w := call(r, row.path, ""); w.Code != row.code {
			t.Errorf("%s: %d", row.path, w.Code)
		}
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("POST", "/campus-map/site?regionId=region-a", strings.NewReader("{}")))
	if w.Code != 405 {
		t.Fatal(w.Code)
	}
}

func TestCompressionConditionalsAndVersionEndpoint(t *testing.T) {
	r, _ := newFixture(t)
	warm(t, r)
	identity := call(r, "/campus-map/site?regionId=region-a", "")
	req := httptest.NewRequest("GET", "/campus-map/site?regionId=region-a", nil)
	req.Header.Set("Accept-Encoding", "br, gzip")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	zipper, err := gzip.NewReader(w.Body)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(zipper)
	_ = zipper.Close()
	if string(body) != identity.Body.String() {
		t.Fatal("gzip payload mismatch")
	}
	req.Header.Set("If-None-Match", w.Header().Get("ETag"))
	out := httptest.NewRecorder()
	r.ServeHTTP(out, req)
	if out.Code != 304 || out.Body.Len() != 0 {
		t.Fatal("conditional response failed")
	}
	version := call(r, "/campus-map/site/version?regionId=region-a", "")
	if version.Code != 200 || !strings.Contains(version.Body.String(), "readRevision") || strings.Contains(version.Body.String(), "north-gate") {
		t.Fatal("version response is not lightweight")
	}
	for _, q := range []string{"gzip;q=0", "gzip;q=0.0", "gzip;q=bad", "br", "gzip;q=2"} {
		if acceptsGzip(q) {
			t.Fatal(q)
		}
	}
}

func TestBoundedConcurrencyDoesNotCallOrigin(t *testing.T) {
	r, o := newFixture(t)
	for i := 0; i < cap(r.inflight); i++ {
		r.inflight <- struct{}{}
	}
	w := call(r, "/campus-map/active?regionId=region-a", "Bearer test")
	if w.Code != 429 || w.Header().Get("Retry-After") == "" || o.authCalls.Load() != 0 {
		t.Fatal("overload not bounded")
	}
}

func TestCacheBudgetAndOversizeResponses(t *testing.T) {
	r, o := newFixture(t)
	warm(t, r)
	r.config.MaxBody = 10
	if err := r.refresh(context.Background(), "region-a"); err == nil {
		t.Fatal("oversized response accepted")
	}
	r.config.MaxBody = 8 << 20
	r.config.MaxCache = 10
	if err := r.refresh(context.Background(), "region-a"); err == nil {
		t.Fatal("cache budget exceeded")
	}
	if o.mapCalls.Load() != 3 {
		t.Fatal(o.mapCalls.Load())
	}
}

func TestRedirectNeverForwardsSecrets(t *testing.T) {
	var reached atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reached.Store(true) }))
	defer target.Close()
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, 302) }))
	defer origin.Close()
	r, _ := newReader(testConfig(origin.URL))
	if err := r.refresh(context.Background(), "region-a"); err == nil {
		t.Fatal("redirect accepted")
	}
	if reached.Load() {
		t.Fatal("internal credential followed redirect")
	}
}

func TestOriginTimeoutIsBounded(t *testing.T) {
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer origin.Close()
	c := testConfig(origin.URL)
	c.Timeout = 100 * time.Millisecond
	r, _ := newReader(c)
	start := time.Now()
	if err := r.refresh(context.Background(), "region-a"); err == nil {
		t.Fatal("timeout ignored")
	}
	if time.Since(start) > time.Second {
		t.Fatal("timeout unbounded")
	}
}

func TestClientIPTrustBoundary(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "203.0.113.4:1234"
	req.Header.Set("X-Real-IP", "198.51.100.7")
	req.Header.Set("X-Forwarded-For", "1.2.3.4")
	if clientIP(req) != "203.0.113.4" {
		t.Fatal("untrusted peer spoofed client IP")
	}
	req.RemoteAddr = "127.0.0.1:1234"
	if clientIP(req) != "198.51.100.7" {
		t.Fatal("trusted nginx IP missing")
	}
	req.Header.Set("X-Real-IP", "invalid")
	if clientIP(req) != "127.0.0.1" {
		t.Fatal("malformed IP accepted")
	}
}

func TestBackgroundRefreshStopsAndReadinessExpires(t *testing.T) {
	r, _ := newFixture(t)
	r.config.Regions = []string{"region-a"}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { r.run(ctx); close(done) }()
	deadline := time.Now().Add(time.Second)
	for r.current("region-a") == nil && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if w := call(r, "/readyz", ""); w.Code != 200 {
		t.Fatal("not ready")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("refresher did not stop")
	}
}

func TestConcurrentRefreshAndReads(t *testing.T) {
	r, _ := newFixture(t)
	warm(t, r)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 20; i++ {
			if err := r.refresh(context.Background(), "region-a"); err != nil {
				t.Error(err)
			}
		}
	}()
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				_ = call(r, "/campus-map/site?regionId=region-a", "")
			}
		}()
	}
	wg.Wait()
}

func TestConfigurationRejectsUnsafeEndpoints(t *testing.T) {
	for _, mutate := range []func(*config){func(c *config) { c.Listen = ":3002" }, func(c *config) { c.Origin = "http://169.254.169.254:80" }, func(c *config) { c.Origin = "http://127.0.0.1:3002" }, func(c *config) { c.Origin = "http://127.0.0.1:3000/admin" }, func(c *config) { c.Token = "" }, func(c *config) { c.Regions = []string{"a", "a"} }, func(c *config) { c.Lease = time.Hour }, func(c *config) { c.MaxInflight = 0 }} {
		c := testConfig("http://127.0.0.1:3000")
		mutate(&c)
		if c.validate() == nil {
			t.Fatal("unsafe config accepted")
		}
	}
}

func TestConfigEnvironmentDefaultsAndValidation(t *testing.T) {
	for _, key := range []string{"CAMPUS_MAP_READ_LISTEN", "CAMPUS_MAP_ORIGIN", "CAMPUS_MAP_REFRESH", "CAMPUS_MAP_LEASE", "CAMPUS_MAP_ORIGIN_TIMEOUT", "CAMPUS_MAP_MAX_INFLIGHT"} {
		t.Setenv(key, "")
	}
	t.Setenv("CAMPUS_MAP_READ_TOKEN", "test-only-internal-snapshot-token-32")
	t.Setenv("CAMPUS_MAP_REGIONS", "global, region-a")
	c, err := loadConfig()
	if err != nil || c.Lease != 5*time.Second || len(c.Regions) != 2 {
		t.Fatal(c, err)
	}
	t.Setenv("CAMPUS_MAP_REFRESH", "not-duration")
	if _, err = loadConfig(); err == nil {
		t.Fatal("bad duration accepted")
	}
}

func TestHTTPIntegrationWithProtectedReadAndHealth(t *testing.T) {
	r, o := newFixture(t)
	warm(t, r)
	r.config.Regions = []string{"region-a"}
	server := httptest.NewServer(r)
	defer server.Close()
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 16; j++ {
				req, _ := http.NewRequest("GET", server.URL+"/api/campus-map/active?regionId=region-a", nil)
				req.Header.Set("Authorization", "Bearer test")
				req.Header.Set("X-Real-IP", "203.0.113.42")
				resp, err := server.Client().Do(req)
				if err != nil {
					t.Error(err)
					return
				}
				body, err := io.ReadAll(resp.Body)
				_ = resp.Body.Close()
				if err != nil || resp.StatusCode != 200 || !strings.Contains(string(body), "north-gate") {
					t.Errorf("HTTP integration: status=%d err=%v", resp.StatusCode, err)
				}
			}
		}()
	}
	wg.Wait()
	if o.mapCalls.Load() != 1 || o.authCalls.Load() != 128 {
		t.Fatalf("map=%d auth=%d", o.mapCalls.Load(), o.authCalls.Load())
	}
	o.mu.Lock()
	forwarded := o.forwarded
	o.mu.Unlock()
	if forwarded != "203.0.113.42" {
		t.Fatal("lost nginx client IP")
	}
	for _, route := range []string{"/healthz", "/readyz", "/metrics"} {
		resp, err := server.Client().Get(server.URL + route)
		if err != nil {
			t.Fatal(err)
		}
		_ = resp.Body.Close()
		if resp.StatusCode != 200 {
			t.Fatal(route, resp.StatusCode)
		}
	}
}

func TestGlobalFallbackOnlyWhenExplicitlyConfigured(t *testing.T) {
	r, o := newFixture(t)
	o.mu.Lock()
	o.content = fixture("global", false, `[]`)
	o.mu.Unlock()
	if err := r.refresh(context.Background(), "global"); err != nil {
		t.Fatal(err)
	}
	if w := call(r, "/campus-map/site", ""); w.Code != 200 {
		t.Fatal(w.Code)
	}
}

func BenchmarkCachedPublicMap(b *testing.B) {
	c := testConfig("http://127.0.0.1:39999")
	r, _ := newReader(c)
	publicPlaces, _ := json.Marshal([]map[string]string{{"id": "place-a", "description": strings.Repeat("x", 55000)}})
	value, err := compileSnapshot([]byte(fixture("region-a", true, string(publicPlaces))), "region-a", time.Now().Add(time.Hour))
	if err != nil {
		b.Fatal(err)
	}
	r.regions["region-a"].snapshot = value
	b.ReportAllocs()
	b.SetBytes(int64(len(value.body)))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = call(r, "/campus-map/site?regionId=region-a", "")
	}
}

func TestOriginRevisionMatchesDirectNestReads(t *testing.T) {
	revision := strings.Repeat("a", 64)
	body := strings.Replace(fixture("region-a", true, `[]`), `"enabled":true`, `"readRevision":"`+revision+`","enabled":true`, 1)
	value, err := compileSnapshot([]byte(body), "region-a", time.Now())
	if err != nil || value.revision != revision {
		t.Fatalf("origin revision not preserved: %v", err)
	}
	for _, bad := range []string{`null`, `12`, `""`, `"untrusted-revision"`} {
		invalid := strings.Replace(body, `"`+revision+`"`, bad, 1)
		if _, err := compileSnapshot([]byte(invalid), "region-a", time.Now()); err == nil {
			t.Fatalf("malformed revision accepted: %s", bad)
		}
	}
}
