import { Element } from "libxmljs";
import { isElement, isNumber, readInt } from "./utilities";
import Tileset, { ITileset } from "./Tileset";
import Layer, { ILayer } from "./Layer";
import ObjectGroup, { IObjectGroup } from "./ObjectGroup";

export interface ITiledMap {
    layers: ReadonlyArray<ILayer>;
    tilesets: ReadonlyArray<ITileset>;
    objectGroups: ReadonlyArray<IObjectGroup>;
    width: number;
    height: number;
    tileWidth: number;
    tileHeight: number;
}

export default class TiledMap {
    readonly #element;
    readonly #currentDirectory;
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
    public async read(): Promise<ITiledMap | null> {
        const width = readInt(this.#element, 'width');
        const height = readInt(this.#element, 'height');
        const tileWidth = readInt(this.#element, 'tilewidth');
        const tileHeight = readInt(this.#element, 'tileheight');
        const layers = this.#readLayers();
        const tilesets = await this.#readTilesets();
        if(
            !tilesets || !layers ||
            !isNumber(width) || !isNumber(height) ||
            !isNumber(tileWidth) || !isNumber(tileHeight)
        ) {
            return null;
        }
        const objectGroups = new Array<IObjectGroup>();
        for(const el of this.#element.find('objectgroup')) {
            if(!isElement(el)){
                return null;
            }
            const objectGroup = new ObjectGroup(el).read();
            if(!objectGroup) {
                return null;
            }
            objectGroups.push(objectGroup);
        }
        return {
            width,
            height,
            objectGroups,
            tileWidth,
            tileHeight,
            tilesets,
            layers
        };
    }
    async #readTilesets(): Promise<ReadonlyArray<ITileset> | null> {
        const tilesetElements = this.#element.find('tileset');
        const tilesets = new Array<ITileset>();
        for(const tilesetEl of tilesetElements) {
            if(!tilesetEl || !isElement(tilesetEl)) {
                return null;
            }
            const tileset = await new Tileset({
                element: tilesetEl,
                currentDirectory: this.#currentDirectory
            }).read();
            if(!tileset) {
                return null;
            }
            tilesets.push(tileset);
        }
        return tilesets;
    }
    #readLayers(): ReadonlyArray<ILayer> | null {
        const layerEls = this.#element.find('layer').map(el => isElement(el) && new Layer(el));
        const layers = new Array<ILayer>();
        for(const layer of layerEls) {
            if(!layer) {
                return null;
            }
            const data = layer.read();
            if(!data) {
                return null;
            }
            layers.push(data);
        }
        return layers;
    }
}
