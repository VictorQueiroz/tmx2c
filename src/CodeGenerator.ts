import CodeStream from "./CodeStream";
import FileManager from "./FileManager";
import MapFileCodeGenerator from "./MapFileCodeGenerator";
import { ITiledMap } from "./TiledMap";

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
    #generateObjectFile() {
        this.#require('<stdint.h>');
        this.write(`${this.#define('struct tiled_object_t')} {\n`, () => {
            this.write(`uint32_t id;\n`);
            this.write(`uint32_t position[2];\n`);
            this.write(`uint32_t size[2];\n`);
            this.write(`const char* type;\n`);
        },'};\n');
        this.write(`${this.#define('struct tiled_polygon_t')} {\n`, () => {
            this.write(`uint32_t id;\n`);
            this.write(`uint32_t position[2];\n`);
            this.write(`const char* type;\n`);
            this.write(`uint32_t point_count;\n`);
            this.write(`struct tiled_point_t* points;\n`);
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
        // const objectGroupFunctions: IFunction<{}>[] = [
        //     {
        //         id: 'alloc',
        //         name: () => `tiled_object_group_alloc`,
        //         header() {
        //             return `struct tiled_object_group_t* ${this.name()}()`;
        //         }
        //     }
        // ];
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
        this.write(`cmake_minimum_required(VERSION 3.20)\n`);
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
        cs.write(`${this.#define('struct tiled_tile_object_t')} {\n`, () => {
            cs.write(`uint32_t id;\n`);
            cs.write('/**\n');
            cs.write(' * x and y properties\n');
            cs.write(' */\n');
            cs.write(`uint32_t position[2];\n`);
            cs.write('/**\n');
            cs.write(' * width and height properties\n');
            cs.write(' */\n');
            cs.write(`uint32_t size[2];\n`);
        },`};\n`);
        cs.write(`${this.#define('struct tiled_tileset_tile_t')} {\n`, () => {
            cs.write('uint32_t id;\n');
            cs.write(`${this.#require('struct tiled_object_group_t')}* object_group;\n`);
        },`};\n`);
        cs.write(`${this.#define('struct tiled_tileset_t')} {\n`, () => {
            cs.write('const char* source;\n');
            cs.write('uint32_t tile_width;\n');
            cs.write('uint32_t columns;\n');
            cs.write('uint32_t tile_height;\n');
            cs.write('uint32_t firstgid;\n');
            cs.write('uint32_t tile_count;\n');
            cs.write('struct tiled_tileset_tile_t* tiles;\n');
        },'};\n');
        cs.write(`${this.#define('struct tiled_layer_t')} {\n`, () => {
            cs.write('uint32_t id;\n');
            cs.write('uint32_t width;\n');
            cs.write('uint32_t height;\n');
            cs.write('const char* name;\n');
            cs.write('uint32_t* data;\n');
        },'};\n');
        cs.write(`${this.#define('struct tiled_map_t')} {\n`, () => {
            cs.write('uint32_t width;\n');
            cs.write('uint32_t height;\n');
            cs.write('uint32_t tile_width;\n');
            cs.write('uint32_t tile_height;\n');
            cs.write('uint32_t tileset_count;\n');
            cs.write('struct tiled_tileset_t* tilesets;\n');
            cs.write('uint32_t layer_count;\n');
            cs.write('struct tiled_layer_t* layers;\n');
            cs.write('uint32_t object_group_count;\n');
            cs.write(`${this.#require('struct tiled_object_group_t')}** object_groups;\n`);
        },'};\n');
        this.#commit('tiled.h');
    }
}
