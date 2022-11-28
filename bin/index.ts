#!/usr/bin/env node

import assert from 'assert';
import libxmljs from 'libxmljs';
import path from 'path';
import fs from 'fs';
import {
    TiledMap,
    CodeGenerator,
    CodeStream
} from '../src';
import { ITiledMap } from '../src/TiledMap';
import {version} from '../package.json';

function printHelp() {
    const cs = new CodeStream();
    cs.write('Usage:\n');
    cs.indentBlock(() => {
        cs.write(`tmx2c src/a.tmx src/b.tmx src/c.tmx:my_custom_map_prefix -o generated`)
    });
    cs.write('\n');
    cs.write('Options:\n');
    cs.indentBlock(() => {
        cs.write('--delete-destination-directory        Force destination directory deletion\n');
        cs.write('--out-dir, -o                         Output directory. Defaults to: generated\n');
        cs.write('--library-name                        Library name. Defaults to: maps\n');
        cs.write('--version                             Library version\n');
        cs.write('-h, --help                            Print this\n');
    });
    process.stdout.write(cs.value());
}

(async () => {
    const maps = new Map<string,ITiledMap>();
    const mapFiles = new Array<{
        name: string;
        path: string
    }>();
    let libraryName = 'maps';
    let outDir: string | null = null;
    let deleteDestinationDirectory = false;
    const args = Array.from(process.argv).slice(2);
    while(args.length) {
        const arg = args[0];
        assert.strict.ok(typeof arg === 'string');
        if(arg === '--version') {
            console.log('tmx2c version %s',version);
            break;
        } else if(arg === '--library-name') {
            args.shift();
            const newLibraryName = args.shift();
            assert.strict.ok(typeof newLibraryName === 'string');
            libraryName = newLibraryName;
        } else if(arg === '--delete-destination-directory') {
            args.shift();
            deleteDestinationDirectory = true;
        } else if(arg.endsWith('.tmx')) {
            args.shift();
            mapFiles.push({
                path: path.resolve(process.cwd(), arg),
                name: `map_${mapFiles.length}`
            });
        } else if(/\.tmx:/.test(arg)) {
            args.shift();
            const [src,dest] = arg.split(':');
            assert.strict.ok(
                typeof src === 'string' &&
                typeof dest === 'string'
            );
            mapFiles.push({
                name: dest,
                path: path.resolve(process.cwd(),src)
            });
        } else if(arg === '-o' || arg === '--out-dir') {
            /**
             * Eat -o / --out-dir
             */
            args.shift();
            const relativePath = args.shift();
            /**
             * argument after -o or --out-dir must be a valid path
             */
            assert.strict.ok(typeof relativePath === 'string');
            outDir = path.resolve(process.cwd(), relativePath);
        } else if(arg === '-h' || arg === '--help') {
            args.shift();
            printHelp();
        } else {
            printHelp();
            throw new Error(`Invalid option: ${arg}`);
        }
    }
    if(outDir === null) {
        outDir = path.resolve(process.cwd(),'generated');
    }
    for(const mapFile of mapFiles) {
        const document = libxmljs.parseXml(await fs.promises.readFile(
            mapFile.path,
            'utf8'
        ));
        const root = document.root();
        assert.strict.ok(root);
        assert.strict.equal('map',root.name());
        const map = await new TiledMap({
            element: root,
            currentDirectory: path.dirname(mapFile.path)
        }).read();
        assert.strict.ok(map !== null);
        maps.set(mapFile.name,map);
    }
    const generator = new CodeGenerator();
    const files = generator.generate({
        maps: Array.from(maps).map(([name,value]) => ({
            name,
            value
        })),
        libraryName
    });
    assert.strict.ok(files);
    if(deleteDestinationDirectory) {
        for(const file of files) {
            const final = path.resolve(
                outDir,
                file.path
            );
            await fs.promises.rm(path.dirname(final),{
                force: true,
                recursive: true
            });
        }
    }
    for(const file of files) {
        const final = path.resolve(
            outDir,
            file.path
        );
        await fs.promises.mkdir(path.dirname(final),{
            recursive: true
        });
        await fs.promises.writeFile(final,file.contents);
    }
})().catch(reason => {
    process.exitCode = 1;
    console.error(reason);
});
