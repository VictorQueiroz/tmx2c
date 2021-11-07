DEST := $(PWD)/out

release:
	npx tsc -b bin && \
	cp -v \
		package.json README.md LICENSE yarn.lock \
		$(DEST)

publish: release
	cd $(DEST) && npm publish

generate:
	npx ts-node \
		--project bin/tsconfig.json \
		bin \
		"test/Kings and Pigs/map.tmx":level_1 \
		"test/Kings and Pigs/map2.tmx":level_2 \
		--delete-destination-directory
