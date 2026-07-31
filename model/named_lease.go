package model

import (
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// NamedLease is a database-backed lease identified by Name. Its expiration is
// evaluated by callers against the same time source they pass to the operations.
type NamedLease struct {
	Name      string `json:"name" gorm:"type:varchar(128);primaryKey"`
	Holder    string `json:"holder" gorm:"type:varchar(128);index"`
	ExpiresAt int64  `json:"expires_at" gorm:"bigint;index"`
	UpdatedAt int64  `json:"updated_at" gorm:"bigint"`
}

// Acquire creates a lease when it does not exist, or atomically takes over a
// lease that expired before now. A lease expiring exactly at now remains valid.
func AcquireNamedLease(name string, holder string, now int64, expires int64) (bool, error) {
	return acquireNamedLease(DB, name, holder, now, expires)
}

func acquireNamedLease(db *gorm.DB, name string, holder string, now int64, expires int64) (bool, error) {
	lease := &NamedLease{
		Name:      name,
		Holder:    holder,
		ExpiresAt: expires,
		UpdatedAt: now,
	}
	result := db.Clauses(clause.OnConflict{DoNothing: true}).Create(lease)
	if result.Error != nil {
		return false, result.Error
	}
	if result.RowsAffected == 1 {
		return true, nil
	}

	result = db.Model(&NamedLease{}).
		Where("name = ? AND expires_at < ?", name, now).
		Updates(map[string]any{
			"holder":     holder,
			"expires_at": expires,
			"updated_at": now,
		})
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected == 1, nil
}

// Renew extends a current, unexpired lease held by holder.
func RenewNamedLease(name string, holder string, now int64, expires int64) (bool, error) {
	return renewNamedLease(DB, name, holder, now, expires)
}

func renewNamedLease(db *gorm.DB, name string, holder string, now int64, expires int64) (bool, error) {
	result := db.Model(&NamedLease{}).
		Where("name = ? AND holder = ? AND expires_at >= ?", name, holder, now).
		Updates(map[string]any{
			"expires_at": expires,
			"updated_at": now,
		})
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected == 1, nil
}

// Release deletes a lease only when holder is still its current holder.
func ReleaseNamedLease(name string, holder string) (bool, error) {
	return releaseNamedLease(DB, name, holder)
}

func releaseNamedLease(db *gorm.DB, name string, holder string) (bool, error) {
	result := db.Where("name = ? AND holder = ?", name, holder).Delete(&NamedLease{})
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected == 1, nil
}
