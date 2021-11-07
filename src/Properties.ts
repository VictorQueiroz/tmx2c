import { Element } from "libxmljs";
import { isElement, isNumber, readString } from "./utilities";

export enum PropertyType {
    Float,
    String,
    Int,
    Bool,
    File,
    Object,
    Color
}

export type Property = {
    type: PropertyType.Int | PropertyType.Float;
    value: string;
} | {
    type: PropertyType.Color;
    r: number;
    g: number;
    b: number;
    a: number;
} | {
    type: PropertyType.String | PropertyType.File;
    value: string;
} | {
    type: PropertyType.Object;
    id: number;
} | {
    type: PropertyType.Bool;
    value: boolean;
};

export default class Properties {
    readonly #element;
    public constructor(element: Element) {
        this.#element = element;
    }
    public read(): ReadonlyMap<string,Property> | null {
        const propsEl = this.#element;
        const properties = new Map<string, Property>();
        if(!propsEl) {
            return properties;
        }
        for(const propEl of propsEl.find('property')) {
            if(!isElement(propEl)) {
                return null;
            }
            const name = readString(propEl,'name');
            const type = readString(propEl,'type');
            const value = readString(propEl,'value');
            if(value === null || name === null) {
                return null;
            }
            let prop: Property;
            switch(type) {
                case 'float':
                    prop = {
                        type: PropertyType.Float,
                        value
                    };
                    break;
                case 'color': {
                    if(!/^#([a-f0-9]{2}){4}$/.test(value)) {
                        return null;
                    }
                    const color: [
                        number | null,
                        number | null,
                        number | null,
                        number | null
                    ] = [null,null,null,null];
                    for(let i = 0; i < 4; i++) {
                        const offset = 1 + (i * 2);
                        const text = value.substring(offset, offset + 1);
                        color[i] = parseInt(text,16);
                        if(!Number.isInteger(color[i])) {
                            return null;
                        }
                    }
                    if(
                        !isNumber(color[0]) || !isNumber(color[1]) ||
                        !isNumber(color[2]) || !isNumber(color[3])
                    ) {
                        return null;
                    }
                    prop = {
                        type: PropertyType.Color,
                        r: color[0],
                        g: color[1],
                        b: color[2],
                        a: color[3]
                    };
                    break;
                }
                case 'bool':
                    if(value !== 'true' && value !== 'false') {
                        return null;
                    }
                    prop = {
                        type: PropertyType.Bool,
                        value: value === 'true'
                    };
                    break;
                case 'int':
                    prop = {
                        type: PropertyType.Int,
                        value
                    };
                    break;
                default:
                    prop = {
                        type: PropertyType.String,
                        value
                    };
            }
            properties.set(name, prop);
        }
        return properties;
    }
}