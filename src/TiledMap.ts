import assert from "assert";
import { Element, Node } from "libxmljs";
import path from "path";
import fs from "fs";

interface ITileset {
    firstgid: number;
    tileWidth: number;
    tileHeight: number;
    tileCount: number;
    columns: number;
    source: string;
    name: string;
}

interface ILayer {
    id: number;
    name: string;
    width: number;
    height: number;
    data: ReadonlyArray<number>;
}

export default class TiledMap {
    readonly #element;
    readonly #tilesets = new Array<ITileset>();
    readonly #layers = new Array<ILayer>();
    readonly #currentDirectory;
    #width = 0;
    #height = 0;
    #tileWidth = 0;
    #tileHeight = 0;
    public constructor({
        element,
        currentDirectory
    }: {
        element: Element;
        currentDirectory: string;
    }) {
        this.#element = element;
        this.#currentDirectory = currentDirectory;
    }
    public layers(): ReadonlyArray<ILayer> {
        return Array.from(this.#layers);
    }
    public tilesets(): ReadonlyArray<ITileset> {
        return Array.from(this.#tilesets);
    }
    public width() {
        return this.#width;
    }
    public height() {
        return this.#height;
    }
    public tileWidth() {
        return this.#tileWidth;
    }
    public tileHeight() {
        return this.#tileHeight;
    }
    public async read() {
        const width = this.#element.attr('width');
        const height = this.#element.attr('height');
        const tileWidth = this.#element.attr('tilewidth');
        const tileHeight = this.#element.attr('tileheight');
        assert.strict.ok(
            width && isValidNumber(width.value()) &&
            height && isValidNumber(height.value()) &&
            tileWidth && isValidNumber(tileWidth.value()) &&
            tileHeight && isValidNumber(tileHeight.value())
        );
        this.#width = parseInt(width.value(),10);
        this.#height = parseInt(height.value(),10);
        this.#tileWidth = parseInt(tileWidth.value(),10);
        this.#tileHeight = parseInt(tileHeight.value(),10);
        await this.#readLayers();
        await this.#readTilesets();
    }
    async #readTilesets() {
        const tilesets = this.#element.find('tileset');
        for(const tileset of tilesets) {
            assert.strict.ok(isElement(tileset));
            const firstgid = tileset.attr('firstgid');
            const tileCount = tileset.attr('tilecount');
            const tileWidth = tileset.attr('tilewidth');
            const tileHeight = tileset.attr('tileheight');
            const columns = tileset.attr('columns');
            const name = tileset.attr('name');
            assert.strict.ok(
                columns && firstgid &&
                tileCount && tileWidth &&
                tileHeight && name
            );
            assert.strict.ok([
                columns,
                firstgid,
                tileCount,
                tileWidth,
                tileHeight
            ].every(n => isValidNumber(n.value())));
            const img = tileset.get('image');
            const source = img?.attr('source');
            assert.strict.ok(source);
            const targetFile = path.resolve(this.#currentDirectory,source.value());
            await fs.promises.access(targetFile,fs.constants.R_OK);
            this.#tilesets.push({
                source: source.value(),
                firstgid: parseInt(firstgid.value(),10),
                name: name.value(),
                tileHeight: parseInt(tileHeight.value(),10),
                columns: parseInt(columns.value(),10),
                tileWidth: parseInt(tileWidth.value(),10),
                tileCount: parseInt(tileCount.value(),10),
            });
        }
    }
    async #readLayers() {
        const layerEls = this.#element.find('layer');
        for(const layerEl of layerEls) {
            assert.strict.ok(isElement(layerEl));
            const dataEl = layerEl.get('data');
            assert.strict.ok(dataEl && dataEl.attr('encoding')?.value() === 'base64');
            const nodes = dataEl.childNodes();
            assert.strict.ok(nodes.length >= 1);
            let contents: string | undefined;
            for(const node of nodes) {
                if(node.type() === 'text') {
                    contents = node.toString();
                    break;
                }
            }
            // FIXME: Of course this will only work for LE CPUs
            const data = contents && new Uint32Array(Buffer.from(contents,'base64').buffer);
            const id = layerEl.attr('id');
            const name = layerEl.attr('name');
            const width = layerEl.attr('width');
            const height = layerEl.attr('height');
            assert.strict.ok(data && width && height && name && id);
            // console.log(contents &&Buffer.from(contents,'base64'),data,Array.from(data))
            this.#layers.push({
                width: parseInt(width.value(),10),
                height: parseInt(height.value(),10),
                id: parseInt(id.value(),10),
                name: name.value(),
                data: Array.from(data)
            });
        }
        return true;
    }
}

function isValidNumber(val: string) {
    const n = parseInt(val,10);
    return !Number.isNaN(n) && Number.isFinite(n);
}

function isElement(el: Node): el is Element {
    return el.type() === 'element';
}
