import { Element } from "libxmljs";
import Properties, { Property } from "./Properties";
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
    polygons: ReadonlyArray<IPolygon>;
}

export interface IPolygon {
    id: number;
    x: number;
    y: number;
    type: string | null;
    points: [string,string][];
    properties: ReadonlyMap<string,Property>;
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
    properties: ReadonlyMap<string,Property>;
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
        const polygons = new Array<IPolygon>();
        for(const objEl of objectElements) {
            if(!isElement(objEl)) {
                return null;
            }
            const objId = readInt(objEl,'id');
            const x = readInt(objEl,'x');
            const y = readInt(objEl,'y');
            const polygonEl = objEl.get('polygon');
            const type = readString(objEl,'type');
            if(!isNumber(objId) || !isNumber(x) || !isNumber(y)) {
                return null;
            }
            const propsEl = objEl.get('properties');
            let properties: ReadonlyMap<string, Property> | null;
            if(propsEl) {
                properties = new Properties(propsEl).read();
            } else {
                properties = new Map();
            }
            if(properties === null) {
                return null;
            }
            if(polygonEl) {
                if(!isElement(polygonEl)) {
                    return null;
                }
                const pointsEl = readString(polygonEl,'points');
                if(pointsEl === null) {
                    return null;
                }
                const points = new Array<[string,string]>();
                for(const point of pointsEl.split(' ')) {
                    const [x,y] = point.split(',');
                    if(
                        typeof x !== 'string' || typeof y !== 'string' ||
                        Number.isNaN(parseFloat(x)) || Number.isNaN(parseFloat(y))
                    ) {
                        return null;
                    }
                    points.push([x,y]);
                }
                polygons.push({
                    id: objId,
                    properties,
                    x,
                    y,
                    type,
                    points
                });
                continue;
            }
            const width = readInt(objEl,'width');
            const height = readInt(objEl,'height');
            if(!isNumber(width) || !isNumber(height)) {
                return null;
            }
            objects.push({
                id: objId,
                properties,
                type,
                x,
                y,
                width,
                height
            });
        }
        return {
            objects,
            polygons,
            id: groupId,
            name
        };
    }
}