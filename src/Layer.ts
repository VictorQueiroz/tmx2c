import { Element } from "libxmljs";
import Properties, { Property } from "./Properties";
import { isNumber, isString, readInt, readString } from "./utilities";

export interface ILayer {
    id: number;
    name: string;
    width: number;
    height: number;
    data: Uint32Array;
    properties: ReadonlyMap<string,Property> | null;
}

export default class Layer {
    readonly #element;
    public constructor(element: Element) {
        this.#element = element;
    }
    public read(): ILayer | null {
        const dataEl = this.#element.get('data');
        if(!dataEl || readString(dataEl,'encoding') !== 'base64') {
            return null;
        }
        const nodes = dataEl.childNodes();
        if(!nodes.length) {
            return null;
        }
        let contents: string | undefined;
        for(const node of nodes) {
            if(node.type() === 'text') {
                contents = node.toString();
                break;
            }
        }
        if(!contents) {
            return null;
        }
        const original = Buffer.from(contents,'base64');
        // FIXME: Of course this will only work for LE CPUs
        const data = new Uint32Array(
            original.buffer,
            original.byteOffset,
            original.byteLength / Uint32Array.BYTES_PER_ELEMENT
        );
        const name = readString(this.#element,'name');
        const id = readInt(this.#element,'id');
        const width = readInt(this.#element,'width');
        const height = readInt(this.#element,'height');
        if(
            !isString(name) || !isNumber(id) ||
            !isNumber(width) || !isNumber(height)
        ) {
            return null;
        }
        const propsEl = this.#element.get('properties');
        const properties = propsEl ? new Properties(propsEl).read() : null;
        return {
            data,
            properties,
            id,
            width,
            height,
            name
        }
    }
}