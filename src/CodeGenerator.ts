import assert from "assert";
import path from "path";
import CodeStream from "./CodeStream";
import TiledMap from "./TiledMap";

export interface IMapFileGenerationContext {
    cs: CodeStream;
    map: TiledMap;
    prefix: string;
}

export interface IMapTarget {
    name: string;
    map: TiledMap;
}

export interface IGeneratedFile {
    path: string;
    contents: string;
}

export interface IMapMethod {
    /**
     * method id
     */
    id: string;
    name: (prefix: string) => string;
    header: (prefix: string) => string;
    definition: (context: IMapFileGenerationContext) => void;
}

const mapMethods: IMapMethod[] = [
    {
        id: 'alloc_map',
        name(prefix) {
            return `tiled_${prefix}_alloc`;
        },
        header(prefix) {
            return `struct tiled_map_t* ${this.name(prefix)}()`;
        },
        definition: ({cs, prefix, map}) => {
            const freeMap = mapMethods.find(m => m.id === 'free_map');
            assert.strict.ok(freeMap);
            cs.write(`struct tiled_map_t* map = calloc(1, sizeof(struct tiled_map_t));\n`);
            cs.write('if(!map) return NULL;\n');
            for(const item of [
                {
                    countProperty: 'tileset_count',
                    property: 'tilesets',
                    type: 'struct tiled_tileset_t',
                    length: map.tilesets().length
                },
                {
                    countProperty: 'layer_count',
                    property: 'layers',
                    type: 'struct tiled_layer_t',
                    length: map.layers().length
                }
            ]) {
                cs.write(`map->${item.countProperty} = ${item.length};\n`);
                cs.write(`map->${item.property} = malloc(${item.length} * sizeof(${item.type}));\n`);
                cs.write(`if(!map->${item.property}) {\n`, () => {
                    cs.write(`${freeMap.name(prefix)}(&map);\n`);
                    cs.write('return NULL;\n');
                },'}\n');
            }
            interface ISetArrayItemsDescription<T = unknown> {
                list: ReadonlyArray<T>;
                values: Record<string, (value: T) => number | string>;
                property: string;
                type: string;
                extra?: (value: T) => void;
            }
            function createSetArrayItems<T>(description: ISetArrayItemsDescription<T>): ISetArrayItemsDescription<T> {
                return description;
            }
            for(const item of [
                createSetArrayItems({
                    list: Array.from(map.tilesets()).sort((t1,t2) => t2.firstgid - t1.firstgid),
                    values: {
                        source: tileset => `"${tileset.source}"`,
                        tile_width: tileset => tileset.tileWidth,
                        columns: tileset => tileset.columns,
                        tile_count: tileset => tileset.tileCount,
                        tile_height: tileset => tileset.tileHeight,
                        firstgid: tileset => tileset.firstgid
                    },
                    type: 'struct tiled_tileset_t',
                    property: 'tilesets'
                }),
                createSetArrayItems({
                    list: map.layers(),
                    values: {
                        width: layer => layer.width,
                        height: layer => layer.height
                    },
                    property: 'layers',
                    type: 'struct tiled_layer_t',
                    extra: (layer) => {
                        cs.write('{\n', () => {
                            cs.write(`const uint32_t length = ${layer.data.length} * sizeof(uint32_t);\n`);
                            cs.write(`n->data = malloc(length);\n`);
                            cs.write(`if(!n->data) {\n`, () => {
                                cs.write(`${freeMap.name(prefix)}(&map);\n`);
                                cs.write(`return NULL;\n`);
                            },'}\n');
                            // TODO: Set the entire n->data block to 0 and only set the offsets which actually contain something
                            // to avoid submitting a bunch of unnecessary zeroes
                            cs.write('const uint32_t src[] = {\n', () => {
                                let col = 0;
                                for(let i = 0; i < layer.data.length; i++) {
                                    const n = layer.data[i];
                                    const isLastByte = i === (layer.data.length - 1);
                                    assert.strict.ok(typeof n === 'number');
                                    if(col === 0) cs.write('');
                                    cs.append(`${n}`);
                                    if(!isLastByte) {
                                        cs.append(',');
                                    }
                                    col++;
                                    if(col > 20 || isLastByte) {
                                        cs.append('\n');
                                        col = 0;
                                    }
                                }
                            },'};\n');
                            cs.write(`memcpy(n->data,src,length);\n`);
                        },'}\n');
                    }
                })
            ] as ISetArrayItemsDescription[]) {
                cs.write('{\n', () => {
                    cs.write(`${item.type}* n = map->${item.property};\n`);
                    for(const n of item.list) {
                        for(const [key, getValue] of Object.entries(item.values)) {
                            cs.write(`n->${key} = ${getValue(n)};\n`);
                        }
                        if(item.extra) {
                            item.extra(n);
                        }
                        if(n !== item.list[item.list.length - 1]) {
                            cs.write(`n++;\n`);
                        }
                    }
                },'}\n');
            }
            cs.write('return map;\n');
        }
    },
    {
        id: 'free_map',
        name(prefix) {
            return `tiled_${prefix}_free`;
        },
        header(prefix) {
            return `void ${this.name(prefix)}(struct tiled_map_t** map_ptr)`;
        },
        definition({cs}) {
            cs.write('struct tiled_map_t* map = *map_ptr;\n');
            cs.write('for(uint32_t i = 0; i < map->layer_count; i++) {\n', () => {
                cs.write(`free(map->layers[i].data);\n`);
                cs.write('map->layers[i].data = NULL;\n');
            },'}\n');
            cs.write(`free(map->layers);\n`);
            cs.write('map->layers = NULL;\n');
            cs.write('free(map->tilesets);\n');
            cs.write('map->tilesets = NULL;\n');
            cs.write('free(map);\n');
            cs.write('*map_ptr = NULL;\n');
        }
    }
];

export default class CodeGenerator extends CodeStream {
    readonly #files = new Array<IGeneratedFile>();
    readonly #mapMethods: ReadonlyMap<string,IMapMethod> = new Map(mapMethods.map(m => [m.id,m]));
    public files(): ReadonlyArray<IGeneratedFile> {
        return this.#files.splice(0,this.#files.length);
    }
    public generate({
        libraryName,
        project = libraryName,
        maps
    }: {
        maps: IMapTarget[];
        libraryName: string;
        project?: string;
    }){
        assert.strict.ok(this.#files.splice(0,this.#files.length).length === 0);
        this.#generateHeader();
        for(const map of maps) {
            this.#generateMapFiles(map);
        }
        this.#generateTestFile(maps);
        this.#createCMakeLists({
            project,
            libraryName
        });
    }
    #generateTestFile(maps: IMapTarget[]) {
        for(const map of maps) {
            this.write(`#include "maps/${map.name}.h"\n`);
        }
        const allocMap = this.#mapMethods.get('alloc_map');
        const freeMap = this.#mapMethods.get('free_map');
        assert.strict.ok(allocMap && freeMap);
        this.write(`#include <assert.h>\n`);
        this.write(`#include <stddef.h>\n`);
        this.write(`int main() {\n`, () => {
            this.write(`struct tiled_map_t* map = NULL;\n`);
            for(const map of maps) {
                this.write(`map = ${allocMap.name(map.name)}();\n`);
                this.write(`assert(map != NULL);\n`);
                this.write(`${freeMap.name(map.name)}(&map);\n`);
                this.write(`assert(map == NULL);\n`);
            }
            this.write(`return 0;\n`);
        },'}\n');
        this.#files.push({
            path: 'test.c',
            contents: this.value()
        })
    }
    #createCMakeLists({libraryName, project}: {
        libraryName: string;
        project: string;
    }) {
        this.write(`project(${project} C)\n`);
        this.write(`set(CMAKE_C_STANDARD 99)\n`);
        this.write(`add_library(\n`, () => {
            this.write(`${libraryName} SHARED\n`);
            this.write(`${Array.from(this.#files).map(f => f.path).join(' ')}\n`);
        },')\n');
        this.write(`add_executable(${libraryName}_test test.c)\n`);
        this.write(`target_link_libraries(${libraryName}_test PRIVATE ${libraryName})\n`);
        this.#files.push({
            path: 'CMakeLists.txt',
            contents: this.value()
        });
    }
    #addCppTags(fn: () => void) {
        this.write('#ifdef __cplusplus\n');
        this.write('extern "C" {\n');
        this.write('#endif // __cplusplus\n');
        fn();
        this.write('#ifdef __cplusplus\n');
        this.write('};\n');
        this.write('#endif // __cplusplus\n');
    }
    #generateHeader() {
        const cs = this;
        this.#addCppTags(() => {
            cs.write('#ifndef TILED_GENERATED_MAIN_HEADER_H_\n');
            cs.write('#define TILED_GENERATED_MAIN_HEADER_H_\n\n');
            cs.write('#include <stdint.h>\n\n');
            cs.write('struct tiled_tileset_t {\n', () => {
                cs.write('const char* source;\n');
                cs.write('uint32_t tile_width;\n');
                cs.write('uint32_t columns;\n');
                cs.write('uint32_t tile_count;\n');
                cs.write('uint32_t tile_height;\n');
                cs.write('uint32_t firstgid;\n');
            },'};\n');
            cs.write('struct tiled_layer_t {\n', () => {
                cs.write('uint32_t id;\n');
                cs.write('uint32_t width;\n');
                cs.write('uint32_t height;\n');
                cs.write('const char* name;\n');
                cs.write('uint32_t* data;\n');
            },'};\n');
            cs.write('struct tiled_map_t {\n', () => {
                cs.write('uint32_t width;\n');
                cs.write('uint32_t height;\n');
                cs.write('uint32_t tile_width;\n');
                cs.write('uint32_t tile_height;\n');
                cs.write('uint32_t tileset_count;\n');
                cs.write('struct tiled_tileset_t* tilesets;\n');
                cs.write('uint32_t layer_count;\n');
                cs.write('struct tiled_layer_t* layers;\n');
            },'};\n');
            cs.write('#endif // TILED_GENERATED_MAIN_HEADER_H_\n');
        });
        this.#files.push({
            contents: cs.value(),
            path: 'tiled.h'
        });
    }
    #generateMapFiles(target: IMapTarget) {
        const {
            name
        } = target;
        const headerFilePath = path.join('maps',`${name}.h`);
        this.#addCppTags(() => {
            this.write(`#ifndef TILED_GENERATED_${name.toUpperCase()}_HEADER_H_\n`);
            this.write(`#define TILED_GENERATED_${name.toUpperCase()}_HEADER_H_\n`);
            this.write(`#include "${path.relative(path.dirname(headerFilePath),'tiled.h')}"\n`)
            for(const fn of this.#mapMethods.values()) {
                this.write(`${fn.header(name)};\n`);
            }
            this.write(`#endif // TILED_GENERATED_${name.toUpperCase()}_HEADER_H_\n`);
        });
        this.#files.push({
            path: headerFilePath,
            contents: this.value()
        });

        this.write(`#include "${name}.h"\n`);
        this.write(`#include <stdlib.h>\n`);
        this.write(`#include <string.h>\n`);
        const context: IMapFileGenerationContext = {
            map: target.map,
            cs: this,
            prefix: target.name
        };
        for(const fn of this.#mapMethods.values()) {
            this.write(`${fn.header(target.name)} {\n`, () => {
                fn.definition(context);
            },'}\n');
        }
        this.#files.push({
            path: path.join('maps',`${name}.c`),
            contents: this.value()
        });
    }
}