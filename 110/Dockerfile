FROM golang:1.21-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    clang \
    llvm \
    libelf-dev \
    linux-headers-generic \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN make build

CMD ["./http-mirror"]
