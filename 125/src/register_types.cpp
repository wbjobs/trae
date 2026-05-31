#include "register_types.h"
#include "terrain/terrain_data.h"
#include "terrain/terrain_mesh.h"
#include "terrain/terrain_chunk.h"
#include "terrain/terrain_world.h"
#include "explosive/explosive.h"
#include "explosive/volume_tracker.h"

#include <gdextension_interface.h>
#include <godot_cpp/core/defs.hpp>
#include <godot_cpp/godot.hpp>

using namespace godot;

void initialize_terrain_destruction_module(ModuleInitializationLevel p_level) {
    if (p_level != MODULE_INITIALIZATION_LEVEL_SCENE) {
        return;
    }

    GDREGISTER_CLASS(TerrainData);
    GDREGISTER_CLASS(TerrainMesh);
    GDREGISTER_CLASS(TerrainChunk);
    GDREGISTER_CLASS(TerrainWorld);
    GDREGISTER_CLASS(Explosive);
    GDREGISTER_CLASS(VolumeTracker);
}

void uninitialize_terrain_destruction_module(ModuleInitializationLevel p_level) {
    if (p_level != MODULE_INITIALIZATION_LEVEL_SCENE) {
        return;
    }
}

extern "C" {
    GDExtensionBool terrain_destruction_extension_init(
        GDExtensionInterfaceGetProcAddress p_get_proc_address,
        GDExtensionClassLibraryPtr p_library,
        GDExtensionInitialization* r_initialization
    ) {
        godot::GDExtensionBinding::InitObject init_obj(p_get_proc_address, p_library, r_initialization);

        init_obj.register_initializer(initialize_terrain_destruction_module);
        init_obj.register_terminator(uninitialize_terrain_destruction_module);
        init_obj.set_minimum_library_initialization_level(MODULE_INITIALIZATION_LEVEL_SCENE);

        return init_obj.init();
    }
}
