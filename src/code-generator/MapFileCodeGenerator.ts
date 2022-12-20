import assert from "assert";
import path from "path";
import CodeStream from "./CodeStream";
import FileManager from "./FileManager";
import { IObjectGroup } from "../ObjectGroup";
import { Property, PropertyType } from "../Properties";
import { ITiledMap } from "../TiledMap";
import { getObjectTypeEnumItem, jsNumberToCFloat } from "./utilities";


export interface IFunction<T = void> {
    /**
     * method id
     */
    id: string;
    name(context: T): string;
    returnType(): string;
    arguments?: (context: T) => ReadonlyArray<string>;
    definition(context: T): void;
}

function declaration<T>(fn: IFunction<T>, context: T) {
    return `${fn.returnType()} ${fn.name(context)}(${fn.arguments ? fn.arguments(context) : ''})`;
}

export interface IMapTarget {
    name: string;
    value: ITiledMap;
}

export interface IMapFileGenerationContext {
    cs: CodeStream;
    map: ITiledMap;
    prefix: string;
}

interface ISetArrayItemsDescription<T = unknown> {
    list: ReadonlyArray<T>;
    values: Record<string, (value: T) => number | string>;
    property: string;
    type: string;
    extra?: (value: T) => void;
}

function createSetArrayItems<T>(description: ISetArrayItemsDescription<T>): Readonly<ISetArrayItemsDescription<T>> {
    return Object.seal(Object.freeze(description));
}

export default class MapFileCodeGenerator extends CodeStream {    
    readonly #methodList: ReadonlyArray<IFunction<IMapFileGenerationContext>> = [
        {
            id: 'alloc_map',
            name({prefix}) {
                return `tiled_${prefix}_alloc`;
            },
            returnType: () => {
                return `struct tiled_map_t*`;
            },
            definition: (ctx) => {
                const {
                    cs,
                    map
                } = ctx;
                const freeMap = this.#methodList.find(m => m.id === 'free_map');
                const tiledMapType = this.#fileManager.require(`struct tiled_map_t`);
                assert.strict.ok(freeMap);
                cs.write(`${tiledMapType}* map = calloc(1, sizeof(${tiledMapType}));\n`);
                cs.write('if(!map) return NULL;\n');
                cs.write(`map->tile_width = ${map.tileWidth};\n`);
                cs.write(`map->tile_height = ${map.tileHeight};\n`);
                cs.write(`map->width = ${map.width};\n`);
                cs.write(`map->height = ${map.height};\n`);
                for(const item of [
                    {
                        countProperty: 'tileset_count',
                        property: 'tilesets',
                        type: 'struct tiled_tileset_t',
                        length: map.tilesets.length
                    },
                    {
                        countProperty: 'layer_count',
                        property: 'layers',
                        type: 'struct tiled_layer_t',
                        length: map.layers.length
                    },
                    {
                        countProperty: 'object_group_count',
                        property: 'object_groups',
                        type: 'struct tiled_object_group_t*',
                        length: map.objectGroups.length
                    },
                    {
                        countProperty: 'layer_index_count',
                        property: 'layer_indices',
                        type: 'struct tiled_layer_index_t',
                        length: map.layerIndices.size
                    }
                ]) {
                    if(!item.length) {
                        cs.write(`map->${item.countProperty} = 0;\n`);
                        cs.write(`map->${item.property} = NULL;\n`);
                        continue;
                    }
                    cs.write(`map->${item.countProperty} = ${item.length};\n`);
                    cs.write(`map->${item.property} = calloc(${item.length}, sizeof(${item.type}));\n`);
                    cs.write(`if(!map->${item.property}) {\n`, () => {
                        cs.write(`${freeMap.name(ctx)}(&map);\n`);
                        cs.write('return NULL;\n');
                    },'}\n');
                }
                const writeFatalErrorExit = () => {
                    cs.write(`${freeMap.name(ctx)}(&map);\n`);
                    cs.write(`return NULL;\n`);
                };
                for(const item of [
                    createSetArrayItems({
                        list: Array.from(map.tilesets).sort((t1,t2) => t2.firstgid - t1.firstgid),
                        values: {
                            source: tileset => `"${tileset.image.source}"`,
                            tile_width: tileset => tileset.tileWidth,
                            columns: tileset => tileset.columns,
                            // tile_count: tileset => tileset.tileCount,
                            tile_height: tileset => tileset.tileHeight,
                            firstgid: tileset => tileset.firstgid
                        },
                        type: 'struct tiled_tileset_t',
                        property: 'tilesets',
                        extra: tileset => {
                            if(!tileset.tileCount || (tileset.tileCount && !tileset.tiles.length)) {
                                cs.write(`n->tile_count = ${tileset.tileCount};\n`);
                                cs.write(`n->tiles = NULL;\n`);
                                return;
                            }
                            cs.write(`n->tile_count = ${tileset.tileCount};\n`);
                            cs.write(`n->tiles = calloc(n->tile_count, sizeof(struct tiled_tileset_tile_t));\n`);
                            cs.write(
                                `if(n->tiles == NULL) {\n`,
                                () => {
                                    writeFatalErrorExit();
                                },
                                '}\n'
                            );
                            cs.write('{\n', () => {
                                const tileVarName = `tile_`;
                                cs.write(`struct tiled_tileset_tile_t* ${tileVarName} = n->tiles;\n`);
                                for(const tile of tileset.tiles) {
                                    cs.write(`// ${tileset.tiles.indexOf(tile)}\n`);
                                    cs.write(`${tileVarName}->id = ${tile.id};\n`);
                                    this.#populateObjectGroupWith({
                                        value: `${tileVarName}->object_group`,
                                        exit: writeFatalErrorExit,
                                        objectGroup: tile.objectGroup
                                    });
                                    this.#populateProperties({
                                        value: `${tileVarName}->properties`,
                                        exit: writeFatalErrorExit,
                                        properties: tile.properties,
                                        count: `${tileVarName}->property_count`
                                    });
                                    if(tile !== tileset.tiles[tileset.tiles.length-1]) {
                                        cs.write(`${tileVarName}++;\n`);
                                    }
                                    cs.write(`\n`);
                                }
                            },'}\n');
                        }
                    }),
                    createSetArrayItems({
                        list: Array.from(map.layerIndices),
                        values: {},
                        property: 'layer_indices',
                        type: 'struct tiled_layer_index_t',
                        extra([key,value]){
                            if('objects' in key) {
                                const index = map.objectGroups.indexOf(key);
                                assert.strict.ok(index !== -1);
                                cs.write(`n->layer = &map->object_groups[${index}];\n`);
                            } else {                                
                                const index = map.layers.indexOf(key);
                                assert.strict.ok(index !== -1);
                                cs.write(`n->layer = &map->layers[${index}];\n`);
                            }
                            cs.write(`n->index = ${value};\n`);
                        }
                    }),
                    createSetArrayItems({
                        list: map.objectGroups,
                        values: {},
                        property: 'object_groups',
                        type: 'struct tiled_object_group_t*',
                        extra: objectGroup => {
                            this.#populateObjectGroupWith({
                                exit: writeFatalErrorExit,
                                value: '(*n)',
                                objectGroup
                            });
                        }
                    }),
                    createSetArrayItems({
                        list: map.layers,
                        values: {
                            name: layer => layer.name,
                            id: layer => layer.id,
                            width: layer => layer.width,
                            height: layer => layer.height
                        },
                        property: 'layers',
                        type: 'struct tiled_layer_t',
                        extra: (layer) => {
                            cs.write('{\n', () => {
                                // cs.write(`const uint32_t length = ;\n`);
                                cs.write(`n->data = calloc(${layer.data.length},sizeof(uint8_t));\n`);
                                cs.write(`if(!n->data) {\n`, () => {
                                    writeFatalErrorExit();
                                },'}\n');
                                this.#populateProperties({
                                    exit: writeFatalErrorExit,
                                    properties: layer.properties,
                                    count: `n->property_count`,
                                    value: `n->properties`
                                });
                                // TODO: Set the entire n->data block to 0 and only set the offsets which actually contain something
                                // to avoid submitting a bunch of unnecessary zeroes
                                cs.write('const uint8_t src[] = {\n', () => {
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
                                cs.write(`memcpy(n->data,src,${layer.data.length} * sizeof(uint8_t));\n`);
                            },'}\n');
                        }
                    })
                ] as ISetArrayItemsDescription[]) {
                    if(!item.list.length) {
                        continue;
                    }
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
            name({prefix}) {
                return `tiled_${prefix}_free`;
            },
            returnType: () => 'void',
            arguments: () => [
                `${this.#fileManager.require('struct tiled_map_t')}** map_ptr`
            ],
            definition: ({cs}) => {
                cs.write('struct tiled_map_t* map = *map_ptr;\n');
                cs.write('uint32_t i;\n');
                /**
                 * Free layers
                 */
                cs.write('for(i = 0; i < map->layer_count; i++) {\n', () => {
                    const layerVarName = `map->layers[i]`;
                    cs.write(`free(${layerVarName}.properties);\n`);
                    cs.write(`${layerVarName}.properties = NULL;\n`);
                    cs.write(`free(${layerVarName}.data);\n`);
                    cs.write(`${layerVarName}.data = NULL;\n`);
                },'}\n');
                cs.write(`free(map->layers);\n`);
                cs.write('map->layers = NULL;\n');
                cs.write(`for(i = 0; i < map->object_group_count; i++) {\n`, () => {
                    this.#freeObjectGroup({
                        value: `map->object_groups[i]`
                    });
                },'}\n');
                cs.write(`free(map->object_groups);\n`);
                cs.write(`map->object_groups = NULL;\n`);
                /**
                 * Free tilesets
                 */
                cs.write(`struct tiled_tileset_t* tileset;\n`);
                cs.write(`struct tiled_tileset_tile_t* tile;\n`);
                cs.write('for(i = 0; i < map->tileset_count; i++) {\n', () => {
                    cs.write(`tileset = &map->tilesets[i];\n`);
                    cs.write('if(tileset->tiles != NULL) {\n', () => {
                        cs.write(`for(uint32_t j = 0; j < tileset->tile_count; j++) {\n`, () => {
                            cs.write('tile = &tileset->tiles[j];\n');
                            this.#freeObjectGroup({
                                value: `tile->object_group`
                            });
                            cs.write('free(tile->properties);\n');
                        },'}\n');
                        cs.write('free(tileset->tiles);\n');
                    },'}\n')
                },'}\n');
                cs.write('free(map->tilesets);\n');
                cs.write('map->tilesets = NULL;\n');
                cs.write(`free(map->layer_indices);\n`);
                cs.write(`map->layer_indices = NULL;\n`);
                cs.write('free(map);\n');
                cs.write('*map_ptr = NULL;\n');
            }
        }
    ];
    readonly #fileManager;
    readonly #methodMap = new Map(this.#methodList.map(m => [m.id,m]));
    public constructor(options: {
        fileManager: FileManager;
    }) {
        super(options.fileManager);
        this.#fileManager = options.fileManager;
    }
    public generateTestFile(maps: IMapTarget[]) {
        for(const map of maps) {
            this.write(`#include "maps/${map.name}.h"\n`);
        }
        const allocMap = this.#methodMap.get('alloc_map');
        const freeMap = this.#methodMap.get('free_map');
        assert.strict.ok(allocMap && freeMap);
        this.write(`#include <assert.h>\n`);
        this.write(`#include <stddef.h>\n`);
        this.write(`int main() {\n`, () => {
            this.write(`${this.#fileManager.require('struct tiled_map_t')}* map = NULL;\n`);
            for(const map of maps) {
                const context = this.#mapGenerationContext(map);
                this.write(`map = ${allocMap.name(context)}();\n`);
                this.write(`assert(map != NULL);\n`);
                this.write(`${freeMap.name(context)}(&map);\n`);
                this.write(`assert(map == NULL);\n`);
            }
            this.write(`return 0;\n`);
        },'}\n');
        this.#fileManager.commit('test.c');
    }
    public generate(target: IMapTarget) {
        const {
            name
        } = target;
        const fm = this.#fileManager;
        const context: IMapFileGenerationContext = this.#mapGenerationContext(target);
        const headerFilePath = path.join('maps',`${name}.h`);
        for(const fn of this.#methodList.values()) {
            this.write(`${declaration(fn,context)};\n`);
        }
        fm.commit(headerFilePath);

        this.write(`#include "${name}.h"\n`);
        this.write(`#include <stdlib.h>\n`);
        this.write(`#include <string.h>\n`);
        for(const fn of this.#methodList.values()) {
            this.write(`${declaration(fn, context)} {\n`, () => {
                fn.definition(context);
            },'}\n');
        }
        fm.commit(path.join('maps',`${name}.c`));
    }
    #mapGenerationContext(target: IMapTarget): IMapFileGenerationContext {
        return {
            map: target.value,
            prefix: target.name,
            cs: this
        };
    }
    #freeObjectGroup(options: {
        value: string;
    }) {
        this.write(`if(${options.value}) {\n`, () => {
            const polygons = `${options.value}->polygons`;
            this.write(`for(uint32_t h = 0; h < ${options.value}->polygon_count; h++) {\n`, () => {
                this.write(`free(${polygons}[h].points);\n`);
            },'}\n');
            this.write(`free(${polygons});\n`);
            this.write(`for(uint32_t h = 0; h < ${options.value}->object_count; h++) {\n`, () => {
                this.write(`free(${options.value}->objects[h].properties);\n`);
            },'}\n');
            this.write(`free(${options.value}->objects);\n`);
            this.write(`free(${options.value});\n`);
        },'}\n');
    }
    #populateObjectGroupWith({
        exit,
        objectGroup,
        value
    }: {
        objectGroup: IObjectGroup | null;
        value: string;
        exit(): void;
    }) {
        const cs = this;
        if(objectGroup === null) {
            cs.write(`${value} = NULL;\n`);
            return;
        }
        const objectCountVarName = `${value}->object_count`;
        const objectsVarName = `${value}->objects`;
        const objectGroupType = this.#fileManager.require('struct tiled_object_group_t');
        cs.write(`${value} = calloc(1, sizeof(${objectGroupType}));\n`);
        cs.write(`if(!${value}) {\n`, () => {
            exit();
        },'}\n');
        cs.write(`${value}->id = ${objectGroup.id};\n`);
        if(objectGroup.objects.length) {
            const objectType = this.#fileManager.require('struct tiled_object_t');
            cs.write(`${objectCountVarName} = ${objectGroup.objects.length};\n`);
            if(objectGroup.name !== null) {
                cs.write(`${value}->name = "${objectGroup.name}";\n`);
            } else {
                cs.write(`${value}->name = NULL;\n`);
            }
            cs.write(`${objectsVarName} = calloc(${objectGroup.objects.length}, sizeof(${objectType}));\n`);
            cs.write(`if(!${objectsVarName}) {\n`, () => {
                exit();
            },'}\n');
            cs.write('{\n', () => {
                const currentObjVarName = 'o_';
                cs.write(`${objectType}* ${currentObjVarName} = ${objectsVarName};\n`);
                for(const obj of objectGroup.objects) {
                    cs.write(`${currentObjVarName}->id = ${obj.id};\n`);
                    cs.write(`${currentObjVarName}->gid = ${obj.gid === null ? 'UINT32_MAX' : obj.gid};\n`);
                    cs.write(`${currentObjVarName}->position[0] = ${obj.x};\n`);
                    cs.write(`${currentObjVarName}->position[1] = ${obj.y};\n`);
                    cs.write(`${currentObjVarName}->size[0] = ${obj.width};\n`);
                    cs.write(`${currentObjVarName}->size[1] = ${obj.height};\n`);
                    cs.write(`${currentObjVarName}->type = ${getObjectTypeEnumItem(obj.type)};\n`);
                    this.#populateProperties({
                        exit,
                        properties: obj.properties,
                        count: `${currentObjVarName}->property_count`,
                        value: `${currentObjVarName}->properties`
                    });
                    if(obj !== objectGroup.objects[objectGroup.objects.length-1]) {
                        cs.write(`${currentObjVarName}++;\n`);
                    }
                }
            },'}\n');
        } else {
            cs.write(`${objectCountVarName} = 0;\n`);
            cs.write(`${objectsVarName} = NULL;\n`);
        }
        /**
         * Add polygon objects
         */
        const polygonType = this.#fileManager.require('struct tiled_polygon_t');
        const polygonsVarName = `${value}->polygons`;
        const polygons = objectGroup.polygons;
        cs.write(`${value}->polygon_count = ${polygons.length};\n`);
        if(!polygons.length) {
            cs.write(`${polygonsVarName} = NULL;\n`);
        } else {
            cs.write(`${polygonsVarName} = calloc(${polygons.length}, sizeof(${polygonType}));\n`);
            cs.write(`if(!${polygonsVarName}) {\n`,() => {
                exit();
            },'}\n');
            cs.write('{\n', () => {
                const curr = 'polygon';
                cs.write(`${polygonType}* ${curr} = ${polygonsVarName};\n`);
                for(const p of polygons) {
                    cs.write(`${curr}->id = ${p.id};\n`);
                    cs.write(`${curr}->position[0] = ${p.x};\n`);
                    cs.write(`${curr}->position[1] = ${p.y};\n`);
                    cs.write(`${curr}->type = ${getObjectTypeEnumItem(p.type)};\n`);
                    const pointType = this.#fileManager.require('struct tiled_point_t');
                    // const pointListByteLength = `${p.points.length} * sizeof(${pointType})`;
                    cs.write(`${curr}->point_count = ${p.points.length};\n`);
                    cs.write(`${curr}->points = calloc(${curr}->point_count, sizeof(${pointType}));\n`);
                    cs.write(`if(!${curr}->points) {\n`, () => {
                        exit();
                    },'}\n');
                    cs.write(`const ${pointType} src[${p.points.length}] = {\n`, () => {
                        for(const point of p.points) {
                            const [x,y] = point;
                            cs.write(`{\n`, () => {
                                cs.write(`${jsNumberToCFloat(x)},\n`);
                                cs.write(`${jsNumberToCFloat(y)}\n`);
                            },'}');
                            if(point !== p.points[p.points.length-1]) {
                                cs.append(`,`);
                            }
                            cs.append('\n');
                        }
                    },'};\n');
                    cs.write(`memcpy(${curr}->points, src, ${curr}->point_count * sizeof(${pointType}));\n`);
                    if(p !== polygons[polygons.length-1]) {
                        cs.write(`${curr}++;\n`);
                    }
                }
            },'}\n');
        }
    }
    #populateProperties({
        value,
        exit,
        properties,
        count
    }: {
        properties: ReadonlyMap<string,Property> | null;
        value: string;
        count: string;
        exit(): void;
    }) {
        if(properties === null || !properties.size) {
            this.write(`${count} = 0;\n`);
            this.write(`${value} = NULL;\n`);
            return;
        }
        const propertyType = this.#fileManager.require('struct tiled_object_property_t');
        this.write(`${count} = ${properties.size};\n`);
        this.write(`${value} = calloc(${count}, sizeof(${propertyType}));\n`);
        this.write(`if(!${value}) {\n`, () => {
            exit();
        },'}\n');
        this.write(`{\n`, () => {
            this.write(`${propertyType}* prop = ${value};\n`);
            const list = Array.from(properties.values());
            for(const [key,prop] of properties) {
                let propType: string;
                const data = `prop->data`;
                switch(prop.type) {
                    case PropertyType.Bool:
                        this.write(`${data}.bool_value = ${prop.value};\n`);
                        propType = `TILED_OBJECT_PROPERTY_TYPE_BOOL`;
                        break;
                    case PropertyType.Float:
                        propType = `TILED_OBJECT_PROPERTY_TYPE_FLOAT`;
                        this.write(`${data}.float_value = ${jsNumberToCFloat(prop.value)};\n`);
                        break;
                    case PropertyType.String:
                        propType = `TILED_OBJECT_PROPERTY_TYPE_STRING`;
                        this.write(`${data}.string_value = "${prop.value}";\n`);
                        break;
                    case PropertyType.Object:
                        propType = `TILED_OBJECT_PROPERTY_TYPE_OBJECT`;
                        this.write(`${data}.uint32_value = ${prop.id};\n`);
                        break;
                    case PropertyType.Color:
                        propType = `TILED_OBJECT_PROPERTY_TYPE_COLOR`;
                        this.write(`${data}.color_value.r = ${prop.r};\n`);
                        this.write(`${data}.color_value.g = ${prop.g};\n`);
                        this.write(`${data}.color_value.b = ${prop.b};\n`);
                        this.write(`${data}.color_value.a = ${prop.a};\n`);
                        break;
                    case PropertyType.File:
                        propType = `TILED_OBJECT_PROPERTY_TYPE_FILE`;
                        this.write(`${data}.string_value = ${prop.value};\n`);
                        break;
                    case PropertyType.Int:
                        propType = `TILED_OBJECT_PROPERTY_TYPE_INT`;
                        this.write(`${data}.int_value = ${prop.value};\n`);
                        break;
                }
                this.write(`prop->name = "${key}";\n`);
                this.write(`prop->type = ${propType};\n`);
                if(prop !== list[list.length-1]) {
                    this.write('prop++;\n');
                }
            }
        },'}\n');
        // this.write(`for(uint32_t i = 0; i < ${count}; i++) {\n`, () => {
        //     const item = `&${value}[i]`;
        //     this.write()
        // },'}\n');
    }
}