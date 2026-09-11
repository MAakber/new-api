go mod download
go build -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$VERSION'" -o new-api-$VERSION.exe
