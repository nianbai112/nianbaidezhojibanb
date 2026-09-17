package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	c, err := loadConfig()
	if err != nil {
		slog.Error("invalid configuration", "error", err.Error())
		os.Exit(1)
	}
	r, err := newReader(c)
	if err != nil {
		slog.Error("reader initialization failed", "error", err.Error())
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go r.run(ctx)
	server := &http.Server{Addr: c.Listen, Handler: r, ReadHeaderTimeout: 2 * time.Second, ReadTimeout: 5 * time.Second, WriteTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16 << 10}
	done := make(chan struct{})
	go func() {
		<-ctx.Done()
		drain, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		if err := server.Shutdown(drain); err != nil {
			slog.Error("drain timeout")
			_ = server.Close()
		}
		close(done)
	}()
	slog.Info("campus map reader starting", "listen", c.Listen, "regions", len(c.Regions), "lease_seconds", c.Lease.Seconds())
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("HTTP server failed", "error", err.Error())
		os.Exit(1)
	}
	<-done
}
