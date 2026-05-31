CC = mpicc
CFLAGS = -O3 -Wall -Wextra -std=c99 -I./include
LDFLAGS = -lfftw3_mpi -lfftw3 -lm

SRC_DIR = src
BUILD_DIR = build
BIN_DIR = bin

TARGET = $(BIN_DIR)/weather_fft

SRCS = $(wildcard $(SRC_DIR)/*.c)
OBJS = $(patsubst $(SRC_DIR)/%.c,$(BUILD_DIR)/%.o,$(SRCS))

.PHONY: all clean run

all: $(TARGET)

$(TARGET): $(OBJS) | $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.c | $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(BIN_DIR):
	mkdir -p $(BIN_DIR)

run: $(TARGET)
	mpirun -np 16 $(TARGET) --nx 2048 --ny 2048 --nz 1024 --output output --lb-interval 5

run-small: $(TARGET)
	mpirun -np 4 $(TARGET) --nx 128 --ny 128 --nz 64 --steps 20 --output output_small --lb-interval 5

run-no-lb: $(TARGET)
	mpirun -np 16 $(TARGET) --nx 2048 --ny 2048 --nz 1024 --output output_nolb --no-lb

clean:
	rm -rf $(BUILD_DIR) $(BIN_DIR)
