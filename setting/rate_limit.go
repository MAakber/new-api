package setting

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

const (
	UserRequestRateLimitEnabledOptionKey = "UserRequestRateLimitEnabled"
	UserRequestRateLimitDefaultOptionKey = "UserRequestRateLimitDefault"

	DefaultUserRequestsPerMinute = 60
	MaxUserRequestsPerMinute     = 1_000_000
)

var ModelRequestRateLimitEnabled = false
var ModelRequestRateLimitDurationMinutes = 1
var ModelRequestRateLimitCount = 0
var ModelRequestRateLimitSuccessCount = 1000
var ModelRequestRateLimitGroup = map[string][2]int{}
var ModelRequestRateLimitMutex sync.RWMutex

var UserRequestRateLimitEnabled = false
var UserRequestRateLimitDefault = DefaultUserRequestsPerMinute

func ValidateUserRequestsPerMinute(requestsPerMinute *int) error {
	if requestsPerMinute == nil {
		return nil
	}
	if *requestsPerMinute < 0 || *requestsPerMinute > MaxUserRequestsPerMinute {
		return fmt.Errorf("requests_per_minute must be between 0 and %d", MaxUserRequestsPerMinute)
	}
	return nil
}

func ValidateUserRequestRateLimitDefault(value string) error {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return fmt.Errorf("%s must be an integer", UserRequestRateLimitDefaultOptionKey)
	}
	if parsed < 1 || parsed > MaxUserRequestsPerMinute {
		return fmt.Errorf("%s must be between 1 and %d", UserRequestRateLimitDefaultOptionKey, MaxUserRequestsPerMinute)
	}
	return nil
}

func ModelRequestRateLimitGroup2JSONString() string {
	ModelRequestRateLimitMutex.RLock()
	defer ModelRequestRateLimitMutex.RUnlock()

	jsonBytes, err := json.Marshal(ModelRequestRateLimitGroup)
	if err != nil {
		common.SysLog("error marshalling model ratio: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateModelRequestRateLimitGroupByJSONString(jsonStr string) error {
	ModelRequestRateLimitMutex.RLock()
	defer ModelRequestRateLimitMutex.RUnlock()

	ModelRequestRateLimitGroup = make(map[string][2]int)
	return json.Unmarshal([]byte(jsonStr), &ModelRequestRateLimitGroup)
}

func GetGroupRateLimit(group string) (totalCount, successCount int, found bool) {
	ModelRequestRateLimitMutex.RLock()
	defer ModelRequestRateLimitMutex.RUnlock()

	if ModelRequestRateLimitGroup == nil {
		return 0, 0, false
	}

	limits, found := ModelRequestRateLimitGroup[group]
	if !found {
		return 0, 0, false
	}
	return limits[0], limits[1], true
}

func CheckModelRequestRateLimitGroup(jsonStr string) error {
	checkModelRequestRateLimitGroup := make(map[string][2]int)
	err := json.Unmarshal([]byte(jsonStr), &checkModelRequestRateLimitGroup)
	if err != nil {
		return err
	}
	for group, limits := range checkModelRequestRateLimitGroup {
		if limits[0] < 0 || limits[1] < 1 {
			return fmt.Errorf("group %s has negative rate limit values: [%d, %d]", group, limits[0], limits[1])
		}
		if limits[0] > math.MaxInt32 || limits[1] > math.MaxInt32 {
			return fmt.Errorf("group %s [%d, %d] has max rate limits value 2147483647", group, limits[0], limits[1])
		}
	}

	return nil
}
