package main

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var regionPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,80}$`)

type config struct {
	Listen, Origin, Token   string
	Regions                 []string
	Refresh, Lease, Timeout time.Duration
	MaxBody, MaxCache       int64
	MaxInflight             int
}

func loadConfig() (config, error) {
	c := config{Listen: "127.0.0.1:3002", Origin: "http://127.0.0.1:3000", Token: os.Getenv("CAMPUS_MAP_READ_TOKEN"), Refresh: 2 * time.Second, Lease: 5 * time.Second, Timeout: 1500 * time.Millisecond, MaxBody: 8 << 20, MaxCache: 64 << 20, MaxInflight: 64}
	for key, target := range map[string]*string{"CAMPUS_MAP_READ_LISTEN": &c.Listen, "CAMPUS_MAP_ORIGIN": &c.Origin} {
		if value := os.Getenv(key); value != "" {
			*target = value
		}
	}
	c.Regions = strings.Split(os.Getenv("CAMPUS_MAP_REGIONS"), ",")
	for i := range c.Regions {
		c.Regions[i] = strings.TrimSpace(c.Regions[i])
	}
	for key, target := range map[string]*time.Duration{"CAMPUS_MAP_REFRESH": &c.Refresh, "CAMPUS_MAP_LEASE": &c.Lease, "CAMPUS_MAP_ORIGIN_TIMEOUT": &c.Timeout} {
		if raw := os.Getenv(key); raw != "" {
			value, err := time.ParseDuration(raw)
			if err != nil {
				return c, fmt.Errorf("invalid %s", key)
			}
			*target = value
		}
	}
	if raw := os.Getenv("CAMPUS_MAP_MAX_INFLIGHT"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil {
			return c, fmt.Errorf("invalid concurrency")
		}
		c.MaxInflight = n
	}
	return c, c.validate()
}

func (c config) validate() error {
	host, _, err := net.SplitHostPort(c.Listen)
	if err != nil || net.ParseIP(host) == nil || !net.ParseIP(host).IsLoopback() {
		return fmt.Errorf("reader must listen on a loopback IP")
	}
	u, err := url.Parse(c.Origin)
	if err != nil || u.Scheme != "http" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || net.ParseIP(u.Hostname()) == nil || !net.ParseIP(u.Hostname()).IsLoopback() || u.Port() == "" {
		return fmt.Errorf("origin must be a fixed loopback HTTP origin")
	}
	_, listenPort, _ := net.SplitHostPort(c.Listen)
	if u.Port() == listenPort {
		return fmt.Errorf("origin must not point to reader")
	}
	if len(c.Token) < 32 || len(c.Token) > 512 || strings.TrimSpace(c.Token) != c.Token || strings.ContainsAny(c.Token, "\r\n") {
		return fmt.Errorf("CAMPUS_MAP_READ_TOKEN must contain 32-512 characters")
	}
	if len(c.Regions) < 1 || len(c.Regions) > 64 {
		return fmt.Errorf("configure 1-64 allowed regions")
	}
	seen := map[string]bool{}
	for _, id := range c.Regions {
		if !regionPattern.MatchString(id) || seen[id] {
			return fmt.Errorf("invalid or duplicate region")
		}
		seen[id] = true
	}
	if c.Refresh < time.Second || c.Refresh > 10*time.Second || c.Timeout < 100*time.Millisecond || c.Timeout > 3*time.Second || c.Lease < c.Refresh+c.Timeout || c.Lease > 15*time.Second {
		return fmt.Errorf("invalid refresh/lease/timeout budget")
	}
	if c.MaxInflight < 1 || c.MaxInflight > 1024 || c.MaxBody < 1024 || c.MaxBody > 8<<20 || c.MaxCache < c.MaxBody*2 || c.MaxCache > 64<<20 {
		return fmt.Errorf("invalid resource budget")
	}
	return nil
}
