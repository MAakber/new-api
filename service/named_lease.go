package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/model"
)

var ErrNamedLeaseBusy = errors.New("named lease is busy")

// WithNamedLease runs fn while holding a database-backed lease. Database
// failures are returned unchanged; only a held lease maps to ErrNamedLeaseBusy.
// fn must stop all mutations when its context is canceled: cancellation signals
// caller cancellation as well as lease-heartbeat loss.
func WithNamedLease(ctx context.Context, name, holder string, ttl time.Duration, fn func(context.Context) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if ttl <= 0 {
		return fmt.Errorf("named lease ttl must be positive")
	}
	now := time.Now().Unix()
	leaseSeconds := int64((ttl + time.Second - 1) / time.Second)
	ok, err := model.AcquireNamedLease(name, holder, now, now+leaseSeconds)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNamedLeaseBusy
	}
	defer func() { _, _ = model.ReleaseNamedLease(name, holder) }()

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	heartbeatErr := make(chan error, 1)
	heartbeatDone := make(chan struct{})
	interval := ttl / 2
	if interval <= 0 {
		interval = time.Millisecond
	}
	go func() {
		defer close(heartbeatDone)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-runCtx.Done():
				return
			case <-ticker.C:
				n := time.Now().Unix()
				ok, err := model.RenewNamedLease(name, holder, n, n+leaseSeconds)
				if err != nil {
					select {
					case heartbeatErr <- err:
					default:
					}
					cancel()
					return
				}
				if !ok {
					select {
					case heartbeatErr <- ErrNamedLeaseBusy:
					default:
					}
					cancel()
					return
				}
			}
		}
	}()

	fnErr := fn(runCtx)
	cancel()
	<-heartbeatDone
	select {
	case err := <-heartbeatErr:
		return err
	default:
	}
	return fnErr
}
