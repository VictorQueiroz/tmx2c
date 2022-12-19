import CodeStream from "./CodeStream";
import FileManager from "./FileManager";
import MapFileCodeGenerator from "./MapFileCodeGenerator";
import { ITiledMap } from "../TiledMap";
import { IObjectGroup } from "../ObjectGroup";
import { getObjectTypeEnumItem } from "./utilities";

export interface IMapFileGenerationContext {
    cs: CodeStream;
    map: ITiledMap;
    prefix: string;
}

export interface IMapTarget {
    name: string;
    value: ITiledMap;
}

export interface IGeneratedFile {
    path: string;
    contents: string;
    requirements: Set<string>;
    identifiers: Set<string>;
}

export interface IFunction<T = void> {
    /**
     * method id
     */
    id: string;
    name: (context: T) => string;
    header: (context: T) => string;
    definition: (context: T) => void;
}

export default class CodeGenerator extends CodeStream {
    readonly #fileManager;
    readonly #mapFileCodeGenerator;
    readonly #objectTypes = new Set<string>();
    public constructor() {
        super();
        this.#fileManager = new FileManager({
            parent: this
        });
        this.#mapFileCodeGenerator = new MapFileCodeGenerator({
            fileManager: this.#fileManager
        });
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
        this.#generateHeader();

        for(const map of maps) {
            this.#updateObjectTypes(map);
        }

        for(const map of maps) {
            this.#mapFileCodeGenerator.generate(map);
        }
        this.#mapFileCodeGenerator.generateTestFile(maps);
        this.#generateObjectFile();
        const files = this.#fileManager.files();
        if(!files) {
            return null;
        }
        this.#createCMakeLists({
            files,
            project,
            libraryName
        });
        const finalFiles = this.#fileManager.files();
        if(!finalFiles) {
            return null;
        }
        return [
            ...files,
            ...finalFiles
        ];
    }
    #updateObjectTypes(map: IMapTarget) {
        const objectGroups = new Array<IObjectGroup>();
        objectGroups.push(...map.value.objectGroups);
        for(const tileset of map.value.tilesets) {
            for(const tile of tileset.tiles) {
                if(tile.objectGroup) {
                    objectGroups.push(tile.objectGroup);
                }
            }
        }
        for(const group of objectGroups) {
            for(const obj of group.objects) {
                if(obj.type) {
                    this.#objectTypes.add(obj.type);
                }
            }
        }
    }
    #generateObjectFile() {
        this.#require('<stdint.h>');
        this.#require('<stdbool.h>');
        this.write(`${this.#define(`enum tiled_object_type_t`)} {\n`, () => {
            this.write(getObjectTypeEnumItem(null));
            const objectTypes = Array.from(this.#objectTypes);
            if(objectTypes.length) {
                this.append(',\n');
            }
            for(const objType of objectTypes) {
                const id = getObjectTypeEnumItem(objType);
                this.write(`${id}`);
                if(objType !== objectTypes[objectTypes.length-1]) {
                    this.append(',');
                }
                this.append('\n');
            }
        },'};\n');
        this.write(`${this.#define('enum tiled_object_property_type_t')} {\n`, () => {
            this.write(`TILED_OBJECT_PROPERTY_TYPE_STRING,\n`);
            this.write(`TILED_OBJECT_PROPERTY_TYPE_INT,\n`);
            this.write(`TILED_OBJECT_PROPERTY_TYPE_OBJECT,\n`);
            this.write(`TILED_OBJECT_PROPERTY_TYPE_FILE,\n`);
            this.write(`TILED_OBJECT_PROPERTY_TYPE_FLOAT,\n`);
            this.write(`TILED_OBJECT_PROPERTY_TYPE_COLOR,\n`);
            this.write(`TILED_OBJECT_PROPERTY_TYPE_BOOL\n`);
        },'};\n');
        this.write(`${this.#define('struct tiled_color_t')} {\n`, () => {
            this.write('uint32_t r;\n');
            this.write('uint32_t g;\n');
            this.write('uint32_t b;\n');
            this.write('uint32_t a;\n');
        },'};\n');
        this.write(`${this.#define('struct tiled_object_property_t')} {\n`, () => {
            this.write('const char* name;\n');
            this.write('enum tiled_object_property_type_t type;\n');
            this.write('union {\n', () => {
                this.write(`struct tiled_color_t color_value;\n`);
                this.write(`const char* string_value;\n`);
                this.write(`int64_t int_value;\n`);
                this.write(`uint32_t uint32_value;\n`);
                this.write(`float float_value;\n`);
                this.write(`bool bool_value;\n`);
            },'} data;\n');
        },'};\n');
        const objectTypeEnum = this.#require('enum tiled_object_type_t');
        const propertyType = this.#require('struct tiled_object_property_t');
        this.write(`${this.#define('struct tiled_object_t')} {\n`, () => {
            this.write(`uint32_t id;\n`);
            this.write(`/**\n`);
            this.write(` * Will be UINT32_MAX if \`gid\` property is not set.\n`);
            this.write(` */\n`);
            this.write(`uint32_t gid;\n`);
            this.write(`uint32_t position[2];\n`);
            this.write(`uint32_t size[2];\n`);
            this.write(`${objectTypeEnum} type;\n`);
            this.write('uint32_t property_count;\n');
            this.write(`${propertyType}* properties;\n`);
        },'};\n');
        this.write(`${this.#define('struct tiled_polygon_t')} {\n`, () => {
            this.write(`uint32_t id;\n`);
            this.write(`uint32_t position[2];\n`);
            this.write(`${objectTypeEnum} type;\n`);
            this.write(`uint32_t point_count;\n`);
            this.write(`struct tiled_point_t* points;\n`);
            this.write('uint32_t property_count;\n');
            this.write(`${propertyType}* properties;\n`);
        },'};\n');
        this.write(`${this.#define('struct tiled_point_t')} {\n`, () => {
            this.write('float x;\n');
            this.write('float y;\n');
        },'};\n');
        this.write(`${this.#define('struct tiled_object_group_t')} {\n`, () => {
            this.write(`uint32_t id;\n`);
            this.write(`const char* name;\n`);
            this.write(`uint32_t object_count;\n`);
            this.write(`struct tiled_object_t* objects;\n`);
            this.write(`uint32_t polygon_count;\n`);
            this.write(`struct tiled_polygon_t* polygons;\n`);
        },'};\n');
        this.#commit('object.h');
    }
    #require(name: string) {
        return this.#fileManager.require(name);
    }
    #define(id: string): string {
        this.#fileManager.define(id);
        return id;
    }
    #commit(path: string) {
        this.#fileManager.commit(path);
    }
    #createCMakeLists({
        files,
        libraryName,
        project
    }: {
        libraryName: string;
        project: string;
        files: IGeneratedFile[];
    }) {
        this.write(`project(${project} C)\n`);
        this.write(`set(CMAKE_C_STANDARD 99)\n`);
        this.write(`cmake_minimum_required(VERSION 3.0)\n`);
        this.write(`add_library(\n`, () => {
            this.write(`${libraryName} SHARED\n`);
            this.write(`${Array.from(files).map(f => f.path).join(' ')}\n`);
        },')\n');
        this.write(`target_compile_options(${libraryName} PRIVATE\n`, () => {
            this.write('-pedantic -Wextra -Werror -Wall\n');
        },')\n');
        this.write(`add_executable(${libraryName}_test test.c)\n`);
        this.write(`target_link_libraries(${libraryName}_test PRIVATE ${libraryName})\n`);
        this.#commit('CMakeLists.txt');
    }
    #generateHeader() {
        const cs = this;
        cs.write('#include <stdint.h>\n\n');
        cs.write(`${this.#define('struct tiled_tileset_tile_t')} {\n`, () => {
            cs.write('uint32_t id;\n');
            cs.write(`${this.#require('struct tiled_object_group_t')}* object_group;\n`);
            cs.write('uint32_t property_count;\n');
            cs.write(`${this.#require('struct tiled_object_property_t')}* properties;\n`);
        },`};\n`);
        cs.write(`${this.#define('struct tiled_tileset_t')} {\n`, () => {
            const tileType = 'struct tiled_tileset_tile_t';
            cs.write('const char* source;\n');
            cs.write('uint32_t tile_width;\n');
            cs.write('uint32_t columns;\n');
            cs.write('uint32_t tile_height;\n');
            cs.write('uint32_t firstgid;\n');
            cs.write('uint32_t tile_count;\n');
            cs.write(`${tileType}* tiles;\n`);
        },'};\n');
        cs.write(`${this.#define('struct tiled_layer_t')} {\n`, () => {
            cs.write('uint32_t id;\n');
            cs.write('uint32_t width;\n');
            cs.write('uint32_t height;\n');
            cs.write('const char* name;\n');
            cs.write('uint8_t* data;\n');
            cs.write('uint32_t property_count;\n');
            cs.write(`${this.#require('struct tiled_object_property_t')}* properties;\n`);
        },'};\n');
        cs.write(`struct tiled_layer_index_t {\n`, () => {
            cs.write(`uint32_t index;\n`);
            cs.write(`void* layer;\n`);
        },'};\n');
        cs.write(`${this.#define('struct tiled_map_t')} {\n`, () => {
            const layerType = 'struct tiled_layer_t';
            cs.write('uint32_t width;\n');
            cs.write('uint32_t height;\n');
            cs.write('uint32_t tile_width;\n');
            cs.write('uint32_t tile_height;\n');
            cs.write('uint32_t tileset_count;\n');
            cs.write('struct tiled_tileset_t* tilesets;\n');
            cs.write('uint32_t layer_count;\n');
            cs.write(`${layerType}* layers;\n`);
            cs.write('uint32_t object_group_count;\n');
            cs.write(`${this.#require('struct tiled_object_group_t')}* object_groups;\n`);
            cs.write(`uint32_t layer_index_count;\n`);
            cs.write(`struct tiled_layer_index_t* layer_indices;\n`);
        },'};\n');
        this.#commit('tiled.h');
    }
}
