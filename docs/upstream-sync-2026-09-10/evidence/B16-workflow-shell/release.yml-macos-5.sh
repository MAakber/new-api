go mod download
go build -ldflags "-X 'github.com/QuantumNous/new-api/common.Version=$VERSION'" -o new-api-macos-$VERSION
