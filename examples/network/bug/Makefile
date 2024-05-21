MKID=node $(TROUPE)/rt/built/p2p/mkid.mjs
MKALIASES=node $(TROUPE)/rt/built/p2p/mkaliases.js
START=$(TROUPE)/network.sh

zero.listener:
	$(START) zero.trp --id=ids/test-listener.json --rspawn=true --aliases=aliases.json --stdiolev={} # --debug --debugp2p

test.dialer:
	$(START) test.trp --id=ids/test-dialer.json --aliases=aliases.json # --debug --debugp2p

create-network-identifiers:
	mkdir -p ids 
	$(MKID) --outfile=ids/test-listener.json
	$(MKID) --outfile=ids/test-dialer.json
	$(MKALIASES) --include ids/test-listener.json --include ids/test-dialer.json --outfile aliases.json
