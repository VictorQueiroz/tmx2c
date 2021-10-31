DEST := $(PWD)/out

release:
	npx tsc -b bin && \
	cp -v \
		package.json yarn.lock \
		$(DEST)

publish: release
	cd $(DEST) && npm publish
