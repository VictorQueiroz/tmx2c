# tmx2c

Export [Tiled Editor](https://thorbjorn.itch.io/tiled) map files (.tmx) to C99 format directly from the command line.

## Installation

```
npm install -g tmx2c
```

## Usage

```
tmx2c "test/Kings and Pigs/map.tmx":main_map "test/Kings and Pigs/map2.tmx":level_2_map -o generated
```

This will generate a CMake project on a relative path (in this case `generated` was chosen) with all the embedded maps information.

```c
#include "generated/maps/main_map.h"
#include "generated/maps/level_2_map.h"
#include <assert.h>
#include <stddef.h>
int main() {
    struct tiled_map_t* map = NULL;
    map = tiled_main_map_alloc();
    assert(map != NULL);
    tiled_main_map_free(&map);
    assert(map == NULL);
    map = tiled_level_2_map_alloc();
    assert(map != NULL);
    tiled_level_2_map_free(&map);
    assert(map == NULL);
    return 0;
}
```

## Object types

The code generator will map all of the mentioned object types into a C enum. So this:

```xml
<objectgroup id="2" name="Object Layer 1">
    <object id="1" name="Player Spawn Point" type="playerSpawnPoint" x="512" y="288" width="32" height="32"/>
    <object id="2" name="Enemy Spawn Point" type="enemySpawnPoint" x="480" y="576" width="32" height="32">
        <properties>
            <property name="attack" value="10"/>
        </properties>
    </object>
</objectgroup>
<objectgroup id="3" name="Object Layer 2">
    <object id="4" name="Health Life Item" type="healthLifeItem" x="160" y="576" width="32" height="32"/>
</objectgroup>
```

Becomes this:

```c
enum tiled_object_type_t {
    TILED_OBJECT_TYPE_NONE,
    TILED_OBJECT_TYPE_PLAYER_SPAWN_POINT,
    TILED_OBJECT_TYPE_ENEMY_SPAWN_POINT,
    TILED_OBJECT_TYPE_HEALTH_LIFE_ITEM
};
```
