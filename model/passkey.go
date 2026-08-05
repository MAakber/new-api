package model

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"gorm.io/gorm"
)

var (
	ErrPasskeyNotFound         = errors.New("passkey credential not found")
	ErrFriendlyPasskeyNotFound = errors.New("Passkey 验证失败，请重试或联系管理员")
	ErrPasskeyLimitReached     = errors.New("Passkey 数量已达到上限")
	ErrPasskeyNameConflict     = errors.New("Passkey 名称已存在")
	ErrPasskeyProofRequired    = errors.New("新增 Passkey 需要安全验证")
)

const (
	MaxPasskeyDisplayNameLength = 64
	MaxPasskeysPerUser          = 10
)

type PasskeyCredential struct {
	ID              int            `json:"id" gorm:"primaryKey"`
	UserID          int            `json:"user_id" gorm:"index:idx_passkey_credentials_user_id;not null"`
	CredentialID    string         `json:"credential_id" gorm:"type:varchar(512);uniqueIndex;not null"` // base64 encoded
	DisplayName     string         `json:"display_name" gorm:"type:varchar(64);not null;default:''"`
	PublicKey       string         `json:"public_key" gorm:"type:text;not null"` // base64 encoded
	AttestationType string         `json:"attestation_type" gorm:"type:varchar(255)"`
	AAGUID          string         `json:"aaguid" gorm:"type:varchar(512)"` // base64 encoded
	SignCount       uint32         `json:"sign_count" gorm:"default:0"`
	CloneWarning    bool           `json:"clone_warning"`
	UserPresent     bool           `json:"user_present"`
	UserVerified    bool           `json:"user_verified"`
	BackupEligible  bool           `json:"backup_eligible"`
	BackupState     bool           `json:"backup_state"`
	Transports      string         `json:"transports" gorm:"type:text"`
	Attachment      string         `json:"attachment" gorm:"type:varchar(32)"`
	LastUsedAt      *time.Time     `json:"last_used_at"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `json:"-" gorm:"index"`
}

// ValidatePasskeyDisplayName enforces the user-facing credential-name contract.
// Names are normalized by trimming surrounding whitespace before validation
// and persistence so uniqueness uses the same canonical user-visible value.
func ValidatePasskeyDisplayName(displayName string) (string, error) {
	if !utf8.ValidString(displayName) {
		return "", errors.New("Passkey 名称格式无效")
	}
	displayName = strings.TrimSpace(displayName)
	if displayName == "" {
		return "", errors.New("Passkey 名称不能为空")
	}
	if utf8.RuneCountInString(displayName) > MaxPasskeyDisplayNameLength {
		return "", fmt.Errorf("Passkey 名称不能超过 %d 个字符", MaxPasskeyDisplayNameLength)
	}
	for _, r := range displayName {
		if unicode.IsControl(r) {
			return "", errors.New("Passkey 名称不能包含控制字符")
		}
	}
	return displayName, nil
}

func (p *PasskeyCredential) TransportList() []protocol.AuthenticatorTransport {
	if p == nil || strings.TrimSpace(p.Transports) == "" {
		return nil
	}
	var transports []string
	if err := common.Unmarshal([]byte(p.Transports), &transports); err != nil {
		return nil
	}
	result := make([]protocol.AuthenticatorTransport, 0, len(transports))
	for _, transport := range transports {
		result = append(result, protocol.AuthenticatorTransport(transport))
	}
	return result
}

func (p *PasskeyCredential) SetTransports(list []protocol.AuthenticatorTransport) {
	if len(list) == 0 {
		p.Transports = ""
		return
	}
	stringList := make([]string, len(list))
	for i, transport := range list {
		stringList[i] = string(transport)
	}
	encoded, err := common.Marshal(stringList)
	if err != nil {
		return
	}
	p.Transports = string(encoded)
}

func (p *PasskeyCredential) ToWebAuthnCredential() webauthn.Credential {
	flags := webauthn.CredentialFlags{
		UserPresent:    p.UserPresent,
		UserVerified:   p.UserVerified,
		BackupEligible: p.BackupEligible,
		BackupState:    p.BackupState,
	}

	credID, _ := base64.StdEncoding.DecodeString(p.CredentialID)
	pubKey, _ := base64.StdEncoding.DecodeString(p.PublicKey)
	aaguid, _ := base64.StdEncoding.DecodeString(p.AAGUID)

	return webauthn.Credential{
		ID:              credID,
		PublicKey:       pubKey,
		AttestationType: p.AttestationType,
		Transport:       p.TransportList(),
		Flags:           flags,
		Authenticator: webauthn.Authenticator{
			AAGUID:       aaguid,
			SignCount:    p.SignCount,
			CloneWarning: p.CloneWarning,
			Attachment:   protocol.AuthenticatorAttachment(p.Attachment),
		},
	}
}

func NewPasskeyCredentialFromWebAuthn(userID int, credential *webauthn.Credential) *PasskeyCredential {
	if credential == nil {
		return nil
	}
	passkey := &PasskeyCredential{
		UserID:          userID,
		CredentialID:    base64.StdEncoding.EncodeToString(credential.ID),
		PublicKey:       base64.StdEncoding.EncodeToString(credential.PublicKey),
		AttestationType: credential.AttestationType,
		AAGUID:          base64.StdEncoding.EncodeToString(credential.Authenticator.AAGUID),
		SignCount:       credential.Authenticator.SignCount,
		CloneWarning:    credential.Authenticator.CloneWarning,
		UserPresent:     credential.Flags.UserPresent,
		UserVerified:    credential.Flags.UserVerified,
		BackupEligible:  credential.Flags.BackupEligible,
		BackupState:     credential.Flags.BackupState,
		Attachment:      string(credential.Authenticator.Attachment),
	}
	passkey.SetTransports(credential.Transport)
	return passkey
}

func GetPasskeyByUserID(userID int) (*PasskeyCredential, error) {
	if userID == 0 {
		common.SysLog("GetPasskeyByUserID: empty user ID")
		return nil, ErrFriendlyPasskeyNotFound
	}
	var credential PasskeyCredential
	if err := DB.Where("user_id = ?", userID).First(&credential).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// 未找到记录是正常情况（用户未绑定），返回 ErrPasskeyNotFound 而不记录日志
			return nil, ErrPasskeyNotFound
		}
		// 只有真正的数据库错误才记录日志
		common.SysLog(fmt.Sprintf("GetPasskeyByUserID: database error for user %d: %v", userID, err))
		return nil, ErrFriendlyPasskeyNotFound
	}
	return &credential, nil
}

// ListPasskeyCredentialsByUserID returns every active credential for a user.
// The stable chronological order is used for WebAuthn exclusion lists and safe
// credential-management responses.
func ListPasskeyCredentialsByUserID(userID int) ([]PasskeyCredential, error) {
	if userID <= 0 {
		common.SysLog("ListPasskeyCredentialsByUserID: empty user ID")
		return nil, ErrFriendlyPasskeyNotFound
	}
	var credentials []PasskeyCredential
	if err := DB.Where("user_id = ?", userID).Order("created_at ASC").Order("id ASC").Find(&credentials).Error; err != nil {
		common.SysLog(fmt.Sprintf("ListPasskeyCredentialsByUserID: database error for user %d: %v", userID, err))
		return nil, ErrFriendlyPasskeyNotFound
	}
	return credentials, nil
}

func ValidateNewPasskeyCredential(userID int, displayName string) (string, error) {
	displayName, err := ValidatePasskeyDisplayName(displayName)
	if err != nil {
		return "", err
	}
	credentials, err := ListPasskeyCredentialsByUserID(userID)
	if err != nil {
		return "", err
	}
	if len(credentials) >= MaxPasskeysPerUser {
		return "", ErrPasskeyLimitReached
	}
	for i := range credentials {
		if strings.EqualFold(credentials[i].DisplayName, displayName) {
			return "", ErrPasskeyNameConflict
		}
	}
	return displayName, nil
}

func GetPasskeyByCredentialID(credentialID []byte) (*PasskeyCredential, error) {
	if len(credentialID) == 0 {
		common.SysLog("GetPasskeyByCredentialID: empty credential ID")
		return nil, ErrFriendlyPasskeyNotFound
	}

	credIDStr := base64.StdEncoding.EncodeToString(credentialID)
	var credential PasskeyCredential
	if err := DB.Where("credential_id = ?", credIDStr).First(&credential).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.SysLog(fmt.Sprintf("GetPasskeyByCredentialID: passkey not found for credential ID length %d", len(credentialID)))
			return nil, ErrFriendlyPasskeyNotFound
		}
		common.SysLog(fmt.Sprintf("GetPasskeyByCredentialID: database error for credential ID: %v", err))
		return nil, ErrFriendlyPasskeyNotFound
	}

	return &credential, nil
}

// UpdatePasskeyAssertionState persists only fields produced by a successful
// assertion. Registration identity (credential ID, public key, AAGUID,
// transports and attestation metadata) is immutable on this path.
func UpdatePasskeyAssertionState(userID int, credential *webauthn.Credential, lastUsedAt time.Time) error {
	if userID <= 0 || credential == nil || len(credential.ID) == 0 || lastUsedAt.IsZero() {
		return fmt.Errorf("Passkey 保存失败，请重试")
	}
	credentialID := base64.StdEncoding.EncodeToString(credential.ID)
	result := DB.Model(&PasskeyCredential{}).
		Where("user_id = ? AND credential_id = ?", userID, credentialID).
		Updates(map[string]interface{}{
			"sign_count":      credential.Authenticator.SignCount,
			"clone_warning":   credential.Authenticator.CloneWarning,
			"user_present":    credential.Flags.UserPresent,
			"user_verified":   credential.Flags.UserVerified,
			"backup_eligible": credential.Flags.BackupEligible,
			"backup_state":    credential.Flags.BackupState,
			"last_used_at":    lastUsedAt,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrPasskeyNotFound
	}
	return nil
}

// CreatePasskeyCredential persists a new independent credential. Enrollment is
// security-sensitive, so it advances the user's auth version exactly once and
// refreshes the user-auth cache after the transaction commits.
func CreatePasskeyCredential(credential *PasskeyCredential, additionalEnrollmentVerified bool) error {
	if credential == nil || credential.UserID <= 0 || strings.TrimSpace(credential.CredentialID) == "" || strings.TrimSpace(credential.PublicKey) == "" {
		return fmt.Errorf("Passkey 保存失败，请重试")
	}
	displayName, err := ValidatePasskeyDisplayName(credential.DisplayName)
	if err != nil {
		return err
	}
	credential.DisplayName = displayName
	if err := DB.Transaction(func(tx *gorm.DB) error {
		// Serialize enrollment decisions on the owning user so concurrent finish
		// requests cannot bypass either the count limit or name uniqueness rule.
		var owner User
		if err := lockForUpdate(tx).Select("id").Where("id = ?", credential.UserID).First(&owner).Error; err != nil {
			return err
		}
		var existing []PasskeyCredential
		if err := tx.Select("display_name").Where("user_id = ?", credential.UserID).Find(&existing).Error; err != nil {
			return err
		}
		if len(existing) >= MaxPasskeysPerUser {
			return ErrPasskeyLimitReached
		}
		if len(existing) > 0 && !additionalEnrollmentVerified {
			return ErrPasskeyProofRequired
		}
		for i := range existing {
			if strings.EqualFold(existing[i].DisplayName, displayName) {
				return ErrPasskeyNameConflict
			}
		}
		if err := tx.Create(credential).Error; err != nil {
			common.SysLog(fmt.Sprintf("CreatePasskeyCredential: failed to create credential for user %d: %v", credential.UserID, err))
			return fmt.Errorf("Passkey 保存失败，请重试")
		}
		if _, err := IncrementUserAuthVersionWithTx(tx, credential.UserID); err != nil {
			return err
		}
		return nil
	}); err != nil {
		return err
	}
	return PublishUserAuthCache(credential.UserID)
}

// DeletePasskeyCredentialByIDAndUserID removes one owned credential without
// affecting the user's other devices. The auth version changes once only when
// a credential was actually deleted.
func DeletePasskeyCredentialByIDAndUserID(id, userID int) error {
	if id <= 0 || userID <= 0 {
		return fmt.Errorf("删除失败，请重试")
	}
	if err := DB.Transaction(func(tx *gorm.DB) error {
		var owner User
		if err := lockForUpdate(tx).Select("id").Where("id = ?", userID).First(&owner).Error; err != nil {
			return err
		}
		var credential PasskeyCredential
		if err := tx.Where("id = ? AND user_id = ?", id, userID).First(&credential).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPasskeyNotFound
			}
			return err
		}
		result := tx.Unscoped().Where("id = ? AND user_id = ?", id, userID).Delete(&PasskeyCredential{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrPasskeyNotFound
		}
		_, err := IncrementUserAuthVersionWithTx(tx, userID)
		return err
	}); err != nil {
		return err
	}
	return PublishUserAuthCache(userID)
}

// DeleteAllPasskeyCredentialsByUserID removes every credential for a user.
// This intentionally advances the auth version once for the single security
// mutation, regardless of how many credentials are removed.
func DeleteAllPasskeyCredentialsByUserID(userID int) error {
	if userID <= 0 {
		return fmt.Errorf("删除失败，请重试")
	}
	if err := DB.Transaction(func(tx *gorm.DB) error {
		var owner User
		if err := lockForUpdate(tx).Select("id").Where("id = ?", userID).First(&owner).Error; err != nil {
			return err
		}
		var credential PasskeyCredential
		if err := tx.Where("user_id = ?", userID).First(&credential).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPasskeyNotFound
			}
			return err
		}
		result := tx.Unscoped().Where("user_id = ?", userID).Delete(&PasskeyCredential{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected < 1 {
			return ErrPasskeyNotFound
		}
		_, err := IncrementUserAuthVersionWithTx(tx, userID)
		return err
	}); err != nil {
		return err
	}
	return PublishUserAuthCache(userID)
}

// UpsertPasskeyCredentialWithAuthVersion is kept for callers compiled against
// the single-device API. It no longer replaces a user's existing credential.
func UpsertPasskeyCredentialWithAuthVersion(credential *PasskeyCredential) error {
	return CreatePasskeyCredential(credential, true)
}

// DeletePasskeyByUserIDWithAuthVersion is the legacy delete-all operation.
func DeletePasskeyByUserIDWithAuthVersion(userID int) error {
	return DeleteAllPasskeyCredentialsByUserID(userID)
}
