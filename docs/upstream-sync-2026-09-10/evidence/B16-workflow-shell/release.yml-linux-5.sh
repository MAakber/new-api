go mod download
go build -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$VERSION' -extldflags '-static'" -o new-api-$VERSION
