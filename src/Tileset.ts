import { Element } from "libxmljs";
import ObjectGroup, { IObjectGroup } from "./ObjectGroup";
import fs from 'fs';
import { isElement, isNumber, isString, readInt, readString } from "./utilities";
import path from "path";

interface ITile {
    id: number;
    objectGroup: IObjectGroup | null;
}

export interface ITileset {
    firstgid: number;
    tileWidth: number;
    tileHeight: number;
    tileCount: number;
    columns: number;
    image: IImage;
    name: string;
    tiles: ReadonlyArray<ITile>;
}

export interface IImage {
    source: string;
    width: number;
    height: number;
}

export default class Tileset {
    readonly #element;
    readonly #currentDirectory;
    public constructor({
        currentDirectory,
        element
    }: {
        element: Element;
        currentDirectory: string;
    }) {
        this.#currentDirectory = currentDirectory;
        this.#element = element;
    }
    public async read(): Promise<ITileset | null> {
        // TODO: Support other kinds of source available in the map format
        const image = this.#image();
        if(!image) {
            return null;
        }
        try {
            await fs.promises.access(
                path.resolve(this.#currentDirectory,image.source),
                fs.constants.R_OK
            );
        } catch(reason) {
            console.error(
                'Source is not accessible from current directory: %o',
                reason
            );
            return null;
        }
        const tileElements = this.#element.find('tile');
        const firstgid = readInt(this.#element, 'firstgid');
        const columns = readInt(this.#element, 'columns');
        const tileWidth = readInt(this.#element, 'tilewidth');
        const name = readString(this.#element, 'name');
        const tileHeight = readInt(this.#element, 'tileheight');
        const tileCount = readInt(this.#element, 'tilecount');
        if(
            !isNumber(firstgid) || !isNumber(tileCount) ||
            !isNumber(tileWidth) || !isNumber(tileHeight) ||
            !isString(name) || !isNumber(columns)
        ) {
            return null;
        }
        const tiles = new Array<ITile>();
        for(const tileEl of tileElements){
            if(!isElement(tileEl)) {
                return null;
            }
            const tile = this.#readTile(tileEl);
            if(!tile) {
                return null;
            }
            tiles.push(tile);
        }
        return {
            name,
            tileCount,
            columns,
            tileWidth,
            tileHeight,
            tiles,
            firstgid,
            image
        };
    }
    #image(): IImage | null {
        const img = this.#element.get('image');
        if(!img || !isElement(img)) {
            return null;
        }
        const source = readString(img,'source');
        const width = readInt(img,'width');
        const height = readInt(img,'height');
        if(!isString(source) || !isNumber(width) || !isNumber(height)) {
            return null;
        }
        return {
            source,
            width,
            height
        };
    }
    #readTile(tileEl: Element): ITile | null {
        const id = readInt(tileEl, 'id');
        if(id === null) {
            return null;
        }
        const tile: ITile = {
            id,
            objectGroup: null
        };
        const objectGroupEl = tileEl.get('objectgroup');
        if(objectGroupEl) {
            tile.objectGroup = new ObjectGroup(objectGroupEl).read();
        }
        return tile;
    }
}