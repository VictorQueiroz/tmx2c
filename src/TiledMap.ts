import { Element } from "libxmljs";
import { isElement, isNumber, readInt } from "./utilities";
import Tileset, { ITileset } from "./Tileset";
import Layer, { ILayer } from "./Layer";
import ObjectGroup, { IObjectGroup } from "./ObjectGroup";

export interface ITiledMap {
    originalFile: string;
    layers: ReadonlyArray<ILayer>;
    tilesets: ReadonlyArray<ITileset>;
    objectGroups: ReadonlyArray<IObjectGroup>;
    width: number;
    height: number;
    tileWidth: number;
    tileHeight: number;
    layerIndices: ReadonlyMap<IObjectGroup | ILayer,number>;
}

export default class TiledMap {
    readonly #element;
    readonly #currentDirectory;
    readonly #layerIndices = new Map<ILayer | IObjectGroup, number>();
    readonly #originalFile;
    public constructor({
        element,
        originalFile,
        currentDirectory
    }: {
        element: Element;
        originalFile: string;
        currentDirectory: string;
    }) {
        this.#originalFile = originalFile;
        this.#element = element;
        this.#currentDirectory = currentDirectory;
    }
    public async read(): Promise<ITiledMap | null> {
        this.#layerIndices.clear();
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
            const index = this.#layerElements().indexOf(el);
            if(index === -1) {
                return null;
            }
            this.#layerIndices.set(objectGroup, index);
        }
        return {
            width,
            height,
            objectGroups,
            originalFile: this.#originalFile,
            tileWidth,
            tileHeight,
            tilesets,
            layers,
            layerIndices: new Map(this.#layerIndices)
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
    #layerElements() {
        return this.#element.find('(objectgroup|layer)');
    }
    #readLayers(): ReadonlyArray<ILayer> | null {
        const layerEls = this.#element.find('layer').map(el => isElement(el) && {
            layer: new Layer(el),
            element: el
        } as const);
        const layers = new Array<ILayer>();
        for(const item of layerEls) {
            if(!item) {
                return null;
            }
            const {
                layer,
                element
            } = item;
            const data = layer.read();
            if(!data) {
                return null;
            }
            const index = this.#layerElements().indexOf(element);
            if(index === -1) {
                return null;
            }
            this.#layerIndices.set(data,index);
            layers.push(data);
        }
        return layers;
    }
}
