package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// UserAvatar stores the metadata for the current avatar object of a user.
// The object itself is kept outside the database.
type UserAvatar struct {
	ID        int       `json:"id" gorm:"primaryKey"`
	UserID    int       `json:"user_id" gorm:"column:user_id;not null;uniqueIndex"`
	ObjectKey string    `json:"object_key" gorm:"column:object_key;type:varchar(512);not null"`
	MimeType  string    `json:"mime_type" gorm:"column:mime_type;type:varchar(64);not null"`
	Size      int64     `json:"size" gorm:"column:size;not null"`
	Width     int       `json:"width" gorm:"column:width;not null"`
	Height    int       `json:"height" gorm:"column:height;not null"`
	SHA256    string    `json:"sha256" gorm:"column:sha256;type:char(64);not null"`
	Version   int64     `json:"version" gorm:"column:version;not null"`
	UpdatedAt time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (UserAvatar) TableName() string {
	return "user_avatars"
}

func GetUserAvatar(userID int) (*UserAvatar, error) {
	if userID <= 0 {
		return nil, errors.New("user ID is required")
	}
	if DB == nil || !DB.Migrator().HasTable(&UserAvatar{}) {
		return nil, nil
	}

	var avatar UserAvatar
	err := DB.Where("user_id = ?", userID).First(&avatar).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &avatar, nil
}

func SaveUserAvatar(avatar *UserAvatar) error {
	if avatar == nil || avatar.UserID <= 0 {
		return errors.New("user avatar user ID is required")
	}
	if DB == nil || !DB.Migrator().HasTable(&UserAvatar{}) {
		return errors.New("user avatar storage is unavailable")
	}
	if avatar.ObjectKey == "" {
		return errors.New("user avatar object key is required")
	}
	if avatar.Version <= 0 {
		avatar.Version = 1
	}
	if avatar.UpdatedAt.IsZero() {
		avatar.UpdatedAt = time.Now()
	}

	if avatar.ID == 0 {
		var existing UserAvatar
		err := DB.Where("user_id = ?", avatar.UserID).First(&existing).Error
		switch {
		case err == nil:
			avatar.ID = existing.ID
		case !errors.Is(err, gorm.ErrRecordNotFound):
			return err
		}
	}
	return DB.Save(avatar).Error
}

func DeleteUserAvatar(userID int) error {
	if userID <= 0 {
		return errors.New("user ID is required")
	}
	return DeleteUserAvatarWithTx(DB, userID)
}

func DeleteUserAvatarWithTx(tx *gorm.DB, userID int) error {
	if tx == nil {
		return errors.New("database is required")
	}
	if userID <= 0 {
		return errors.New("user ID is required")
	}
	// Older unit fixtures may only migrate the User table. Production migration
	// always creates user_avatars before this path is reachable.
	if !tx.Migrator().HasTable(&UserAvatar{}) {
		return nil
	}
	return tx.Where("user_id = ?", userID).Delete(&UserAvatar{}).Error
}
