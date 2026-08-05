package model

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func TestRegistrationCodeRequiredQuotesMySQLKeyColumn(t *testing.T) {
	recorder := &migrationSQLRecorder{}
	db, err := gorm.Open(mysql.New(mysql.Config{
		DSN:                       "gorm:gorm@tcp(localhost:9910)/gorm?charset=utf8&parseTime=True&loc=Local",
		SkipInitializeWithVersion: true,
	}), &gorm.Config{
		DisableAutomaticPing: true,
		DryRun:               true,
		Logger:               recorder,
	})
	require.NoError(t, err)

	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })

	_, err = RegistrationCodeRequired()
	require.NoError(t, err)
	require.NotEmpty(t, recorder.statements)
	statement := recorder.statements[len(recorder.statements)-1]
	assert.Contains(t, statement, "WHERE `options`.`key` = 'RegistrationCodeEnabled'")
	assert.False(t, strings.Contains(statement, "WHERE key ="))
}
