#include "thermostat.h"

#include <cstdio>
#include <cstdlib>

int main(int argc, char** argv) {
    try {
        Thermostat app;
        return app.run(argc, argv);
    } catch (const std::exception& e) {
        std::fprintf(stderr, "Fatal: %s\n", e.what());
        return EXIT_FAILURE;
    }
}
