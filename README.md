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
