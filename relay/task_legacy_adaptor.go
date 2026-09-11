package relay

import (
	"strconv"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relay/channel"
	taskali "github.com/QuantumNous/new-api/relay/channel/task/ali"
	taskdoubao "github.com/QuantumNous/new-api/relay/channel/task/doubao"
	taskgemini "github.com/QuantumNous/new-api/relay/channel/task/gemini"
	"github.com/QuantumNous/new-api/relay/channel/task/hailuo"
	taskjimeng "github.com/QuantumNous/new-api/relay/channel/task/jimeng"
	jspluginadaptor "github.com/QuantumNous/new-api/relay/channel/task/jsplugin"
	"github.com/QuantumNous/new-api/relay/channel/task/kling"
	tasksora "github.com/QuantumNous/new-api/relay/channel/task/sora"
	"github.com/QuantumNous/new-api/relay/channel/task/suno"
	taskvertex "github.com/QuantumNous/new-api/relay/channel/task/vertex"
	taskvidu "github.com/QuantumNous/new-api/relay/channel/task/vidu"
)

// Legacy task platform IDs keep their original parsers, polling and pricing.
func getLegacyTaskAdaptor(platform constant.TaskPlatform) channel.TaskAdaptor {
	if platform == constant.TaskPlatformSuno {
		return &suno.TaskAdaptor{}
	}
	channelType, err := strconv.Atoi(string(platform))
	if err != nil {
		return nil
	}
	switch channelType {
	case constant.ChannelTypeAli:
		return &taskali.TaskAdaptor{}
	case constant.ChannelTypeKling:
		return &kling.TaskAdaptor{}
	case constant.ChannelTypeJimeng:
		return &taskjimeng.TaskAdaptor{}
	case constant.ChannelTypeVertexAi:
		return &taskvertex.TaskAdaptor{}
	case constant.ChannelTypeVidu:
		return &taskvidu.TaskAdaptor{}
	case constant.ChannelTypeDoubaoVideo, constant.ChannelTypeVolcEngine:
		return &taskdoubao.TaskAdaptor{}
	case constant.ChannelTypeSora, constant.ChannelTypeOpenAI:
		return &tasksora.TaskAdaptor{}
	case constant.ChannelTypeGemini:
		return &taskgemini.TaskAdaptor{}
	case constant.ChannelTypeMiniMax:
		return &hailuo.TaskAdaptor{}
	default:
		return nil
	}
}

func GetTaskPluginAdaptor(key string) channel.TaskAdaptor {
	plugin, ok := jsplugin.DefaultRegistry.Generation().Get(key)
	if !ok {
		return nil
	}
	return jspluginadaptor.New(plugin)
}

// An execution snapshot is authoritative even if a plugin key happens to be
// the same as an old platform name, or the channel binding changes later.
func GetTaskAdaptorForTask(task *model.Task) channel.TaskAdaptor {
	if task == nil {
		return nil
	}
	if execution := task.PrivateData.Execution; execution != nil && execution.TaskPlugin != nil && execution.TaskPlugin.Key != "" {
		return GetTaskPluginAdaptor(execution.TaskPlugin.Key)
	}
	return GetTaskAdaptor(task.Platform)
}
