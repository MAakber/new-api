package operation_setting

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/setting/config"
)

type MonitorSetting struct {
	AutoTestChannelEnabled         bool    `json:"auto_test_channel_enabled"`
	AutoTestChannelMinutes         float64 `json:"auto_test_channel_minutes"`
	ChannelTestMode                string  `json:"channel_test_mode"`
	ChannelTestMessage             string  `json:"channel_test_message"`
	ChannelTestUseChannelStyle     bool    `json:"channel_test_use_channel_style"`
	ChannelTestShowResponsePreview bool    `json:"channel_test_show_response_preview"`
}

const (
	ChannelTestModeScheduledAll    = "scheduled_all"
	ChannelTestModePassiveRecovery = "passive_recovery"

	DefaultChannelTestMessage  = "hi"
	ChannelTestMessageMaxRunes = 4096

	ChannelTestMessageOptionKey             = "monitor_setting.channel_test_message"
	ChannelTestUseChannelStyleOptionKey     = "monitor_setting.channel_test_use_channel_style"
	ChannelTestShowResponsePreviewOptionKey = "monitor_setting.channel_test_show_response_preview"
)

// 默认配置
func defaultMonitorSetting() MonitorSetting {
	return MonitorSetting{
		AutoTestChannelEnabled:         false,
		AutoTestChannelMinutes:         10,
		ChannelTestMode:                ChannelTestModeScheduledAll,
		ChannelTestMessage:             DefaultChannelTestMessage,
		ChannelTestUseChannelStyle:     true,
		ChannelTestShowResponsePreview: false,
	}
}

var monitorSetting = defaultMonitorSetting()

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("monitor_setting", &monitorSetting)
}

func GetMonitorSetting() *MonitorSetting {
	if os.Getenv("CHANNEL_TEST_FREQUENCY") != "" {
		frequency, err := strconv.Atoi(os.Getenv("CHANNEL_TEST_FREQUENCY"))
		if err == nil && frequency > 0 {
			monitorSetting.AutoTestChannelEnabled = true
			monitorSetting.AutoTestChannelMinutes = float64(frequency)
			monitorSetting.ChannelTestMode = ChannelTestModeScheduledAll
		}
	}
	if enabled, ok := os.LookupEnv("CHANNEL_TEST_ENABLED"); ok {
		parsed, err := strconv.ParseBool(enabled)
		if err == nil {
			monitorSetting.AutoTestChannelEnabled = parsed
		}
	}
	if monitorSetting.ChannelTestMode != ChannelTestModePassiveRecovery {
		monitorSetting.ChannelTestMode = ChannelTestModeScheduledAll
	}
	message, err := NormalizeChannelTestMessage(monitorSetting.ChannelTestMessage)
	if err != nil || message == "" {
		monitorSetting.ChannelTestMessage = DefaultChannelTestMessage
	} else {
		monitorSetting.ChannelTestMessage = message
	}
	return &monitorSetting
}

// NormalizeChannelTestMessage trims a test prompt and bounds it before it can
// be used as a synthetic upstream request. An empty value is intentionally
// valid: callers use it to fall back to the saved global default.
func NormalizeChannelTestMessage(message string) (string, error) {
	message = strings.TrimSpace(message)
	if message == "" {
		return "", nil
	}
	if !utf8.ValidString(message) {
		return "", fmt.Errorf("channel test message must be valid UTF-8")
	}
	if utf8.RuneCountInString(message) > ChannelTestMessageMaxRunes {
		return "", fmt.Errorf("channel test message must not exceed %d characters", ChannelTestMessageMaxRunes)
	}
	return message, nil
}
