sudo apt-get update
DEBIAN_FRONTEND=noninteractive sudo apt-get install -y gcc-aarch64-linux-gnu
CC=aarch64-linux-gnu-gcc CGO_ENABLED=1 GOOS=linux GOARCH=arm64 go build -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$VERSION' -extldflags '-static'" -o new-api-arm64-$VERSION
