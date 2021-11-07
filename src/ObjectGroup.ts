import { Element } from "libxmljs";
import {
    isElement,
    isNumber,
    readInt,
    readString
} from "./utilities";

export interface IObjectGroup {
    id: number;
    name: string | null;
    objects: ReadonlyArray<IObject>;
}

export interface IObject {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    // TODO: maybe, during code generation, we could create an enum on C automatically based on the object types. This way we
    // can improve type safety even further on C code and also know *exactly* what object types to expect.
    // This sounds like a good idea to me right now.
    type: string | null;
}

export default class ObjectGroup {
    readonly #element;
    public constructor(element: Element) {
        this.#element = element;
    }
    public read(): IObjectGroup | null {
        const objectElements = this.#element.find('object');
        const objects = new Array<IObject>();
        const groupId = readInt(this.#element,'id');
        const name = readString(this.#element,'name');
        if(groupId === null) {
            return null;
        }
        for(const objEl of objectElements) {
            if(!isElement(objEl)) {
                return null;
            }
            const objId = readInt(objEl,'id');
            const x = readInt(objEl,'x');
            const y = readInt(objEl,'y');
            const width = readInt(objEl,'width');
            const type = readString(objEl,'type');
            const height = readInt(objEl,'height');
            if(
                !isNumber(objId) ||
                !isNumber(x) || !isNumber(y) ||
                !isNumber(width) || !isNumber(height)
            ) {
                return null;
            }
            objects.push({
                id: objId,
                type,
                x,
                y,
                width,
                height
            });
        }
        return {
            objects,
            id: groupId,
            name
        };
    }
}