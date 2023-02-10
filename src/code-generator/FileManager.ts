import CodeStream from "codestreamjs";
import path from "path";

export interface IGeneratedFile {
    path: string;
    contents: string;
    requirements: Set<string>;
    identifiers: Set<string>;
}

export default class FileManager extends CodeStream {
    readonly #files = new Array<IGeneratedFile>();
    readonly #identifiers = new Set<string>();
    readonly #requirements = new Set<string>();
    public constructor(options: {
        parent?: CodeStream;
    }) {
        super(options.parent);
    }
    public files() {
        const files = this.#files.splice(0,this.#files.length);
        for(const file of files) {
            const includes = new Set<string | IGeneratedFile>();
            for(const r of file.requirements) {
                if(r.startsWith('<') && r.endsWith('>')) {
                    includes.add(r);
                    continue;
                }
                let failed = true;
                for(const f of files) {
                    if(f.identifiers.has(r)) {
                        if(f !== file) {
                            includes.add(f);
                        }
                        failed = false;
                        break;
                    }
                }
                if(failed) {
                    console.error(
                        '%s requests %s, but it was not available in any file',
                        file.path,
                        r
                    );
                    return null;
                }
            }

            const contents = file.contents;
            const isHeaderFile = /\.h$/.test(file.path);
            const headerDefineName = `TILED_GENERATED_${file.path.toUpperCase().replace(/[^a-zA-Z0-9]+/g,'_')}_H_`;

            if(isHeaderFile) {                
                this.write('#ifdef __cplusplus\n');
                this.write('extern "C" {\n');
                this.write('#endif // __cplusplus\n\n');

                this.write(`#ifndef ${headerDefineName}\n`);
                this.write(`#define ${headerDefineName}\n\n`);
            }

            for(const include of includes) {
                if(typeof include === 'string') {
                    this.write(`#include ${include}\n`);
                    continue;
                }
                this.write(`#include "${path.relative(path.dirname(file.path),include.path)}"\n`);
            }
            
            this.append(contents);

            if(isHeaderFile) {
                this.write(`\n#endif // ${headerDefineName}\n\n`);
                this.write('#ifdef __cplusplus\n');
                this.write('};\n');
                this.write('#endif // __cplusplus\n');
            }

            file.contents = this.value();
        }
        return Array.from(files);
    }
    public require(name: string) {
        this.#requirements.add(name);
        return name;
    }
    public define(id: string): string {
        this.#identifiers.add(id);
        return id;
    }
    /**
     * Commit a file and current defined identifiers to the file list.
     */
    public commit(path: string) {
        const identifiers = new Set(this.#identifiers);
        const requirements = new Set(this.#requirements);
        this.#requirements.clear();
        this.#identifiers.clear();
        this.#files.push({
            path,
            requirements,
            identifiers,
            contents: this.value()
        });
    }
}