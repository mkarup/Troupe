MKID=node $(TROUPE)/rt/built/p2p/mkid.mjs
MKALIASES=node $(TROUPE)/rt/built/p2p/mkaliases.js
START=$(TROUPE)/network.sh

battleship-game:

	$(START) battleship-game.trp --id=ids/battleship-game.json --port=6789 # --debug --debugp2p

battleship-player1:
	$(START) battleship-player.trp --id=ids/battleship-player1.json --aliases=aliases.json  # --debug --debugp2p

battleship-player2:
	$(START) battleship-player.trp --id=ids/battleship-player2.json --aliases=aliases.json  # --debug --debugp2p

create-network-identifiers:
	mkdir -p ids 
	$(MKID) --outfile=ids/battleship-game.json
	$(MKID) --outfile=ids/battleship-player1.json
	$(MKID) --outfile=ids/battleship-player2.json
	$(MKALIASES) --include ids/battleship-game.json --include ids/battleship-player1.json --include ids/battleship-player2.json --outfile aliases.json
