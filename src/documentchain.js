function convertStringToArrayBufferView(str) {
	var bytes = new Uint8Array(str.length);
	for (var i = 0; i < str.length; i++) {
		bytes[i] = str.charCodeAt(i);
	}
	return bytes;
}

function convertArrayBufferToHexaDecimal(buffer) {
	var data_view = new DataView(buffer);
	var i, len, hex = '', c;

	for(i = 0, len = data_view.byteLength; i < len; i += 1) 
	{
		c = data_view.getUint8(i).toString(16);
		if(c.length < 2)  {
			c = '0' + c;
		}
		hex += c;
	}
	return hex;
}

function sendDocumentToWebWallet(attrHash, ownerHash, fileHash /* hashes as hex str*/) {
	return new Promise(function(resolve, reject) {
		const wallet  = "https://api.dms.cash/?api=post";    // or "https://api.documentchain.org/" or your server
		const account = "account=FBQKHFEFLHJJPLKEKGLHPJRQE"; // or your encrypted account for mainnet
		const testnet = "testnet=1";  // or mainnet: "testnet=0"
		const anyid   = "id=myid";       // optional id is included in the response

		// https://github.com/Krekeler/documentchain/blob/master/dms-docs/document-revision-data.md
		const rawdata = "raw="
		              + "444D24"   // magic chars "DM$"
		              + "0002"     // data type/version v2
		              + "0004"     // WebAPI App ID: use another ID for your application, you can reserve your app ID with us

		          /*  + "0"        // begin: optional GUID
		              + "0"        // App-defined char 0..F
		              + "00"       // Algorithm: 00=MD5/GUID
		              + the guid   // a guid from your document management system

		              + "F"        // begin hash: optional MD5 hash for document index
		              + "0"        // App-defined char 0..F
		              + "00"       // Algorithm: 00=MD5/GUID
		              + hash Index // MD5 allows searching the file on blockchain without transaction id */	              

		              + "A"        // begin: optional attribute hash 
		              + "0"        // App-defined char 0..F
		              + "22"       // Algorithm: 22=SHA2-256
		              + attrHash   // the attribute hash

		              + "B"        // begin: optional owner hash 
		              + "0"        // App-defined char 0..F
		              + "22"       // Algorithm: 22=SHA2-256
		              + ownerHash  // the owner hash

		              + "F"        // begin hash: document file hash 
		              + "0"        // App-defined char 0..F
		              + "25"       // Algorithm: 25=SHA2-512
		              + fileHash;  // the secure SHA2-512 file hash for revision
				               // more hashes can follow

		const request = wallet
				+ "&" + account
				+ "&" + testnet 
				+ "&" + anyid
				+ "&" + rawdata;
		console.log(request);

		/* json responce:
		{ net: "test" , api: "post" , ver: "0.1.0.2" , id: "myid" , url: "https://api.dms.cash/" , res: true , err: "" , 
		  txid: "bdd6606beb5da715aaa331d11120fc941019b12f93a6ecc6cde559fe26a1ea7c" }
		*/
		var http = new XMLHttpRequest();
		http.open("POST", request , false);
		http.onload = function() {
			console.log(http.responseText);
			const ojson = JSON.parse(http.responseText);
			console.log("https://documentchain.org/explorer/?search=" + ojson.txid + "&testnet=true#dest");
			resolve(ojson.txid);
		}
		http.onerror = function() {
			reject(Error(req.statusText));
		}
		http.send();	
	});
}

function loadTransactionFromBlockchain(txid) {
	return new Promise(function(resolve, reject) {
		const wallet  = "https://api.dms.cash/?api=getrawtransaction&verbose=1"; // or "https://api.documentchain.org/" or your server
		const testnet = "testnet=1";  // or mainnet: "testnet=0"
		const anyid   = "id=myid";    // optional id is included in the response
		const request = wallet
				+ "&" + testnet 
				+ "&" + anyid
				+ "&tx=" + txid;

		var http = new XMLHttpRequest();
		http.open("POST", request , false);
		http.onload = function() {
			const ojson = JSON.parse(http.responseText);
			resolve(ojson);
		}
		http.onerror = function() {
			reject(Error(req.statusText));
		}
		http.send();	
	});
}

function splitRawDataV2(hex) {
	// https://github.com/Krekeler/documentchain/blob/master/dms-docs/document-revision-data.md
	// 6a4c8d 444d24 0002 0004
	// a0225f187f616cc8b1234dc336f815807d079a936ab31c151b936a96ecea8997685f
	// b022f4cfd3e003dfcea3aacc5576b2ba612b9b1c9bfd052982b3d9cef13cef092dc5
	// f02509eacb6dbec0d45111a409b3561eb34b1275f393ec28632cb42825c331780c69134dc1c3374c1d3a255073aad8b691137fcd3c9ad56eec539a89c604d4d6785e
	if (!hex.startsWith("6a4c8d444d240002"))
		return null;

	var result = new Array();
    var i = 20;
	while (i < hex.length) {
		var prefix = hex.substr(i, 4);
		switch(prefix) {
			// e.g. "f025": replace the second char with your app-defined if you don't use "0"
			case "a022": // attribute hash SHA2-256
				result['a022'] = hex.substr(i+4, 64);
				i+=68; // 68 = prefix + hash
				break;
			case "b022": // owner hash SHA2-256
				result['b022'] = hex.substr(i+4, 64);
				i+=68;
				break;
			case "f025": // file hash SHA2-512
				result['f025'] = hex.substr(i+4, 128);
				i+=132;
				break;
			/* expand this list if you use other hashes, like:
			case "f022": // file hash SHA2-256
				result['f022'] = hex.substr(i+4, 64);
				i+=68;
				break;
			*/
			default:     // unknown data, something went wrong
				return null;
		}
	}
	return result;
}

/* Store document/file hashes on blockchain
*/
function secureFile() {
	const oFiles = document.getElementById("FileInput").files;
	
	if (oFiles.length == 1 ) {
		const reader = new FileReader();
		// optional attribute hash with descriptions of the document, like data from document management system
		const attrData = convertStringToArrayBufferView(oFiles[0].name + oFiles[0].size);
		// optional file owner data, note that we only store hashes of this data on blockchain
		const ownerData = convertStringToArrayBufferView("this could be the name, address, email, etc.");
	  
		reader.onload = function(e) {
			const fileData = convertStringToArrayBufferView(reader.result);
			var promiseAttrHash  = crypto.subtle.digest("SHA-256", attrData);
			var promiseOwnerHash = crypto.subtle.digest("SHA-256", ownerData);
			var promiseFileHash  = crypto.subtle.digest("SHA-512", fileData);

			Promise.all([promiseAttrHash, promiseOwnerHash, promiseFileHash]).then(([attrHash, ownerHash, fileHash]) => {
				const attrHex  = convertArrayBufferToHexaDecimal(attrHash);
				const ownerHex = convertArrayBufferToHexaDecimal(ownerHash);
				const fileHex  = convertArrayBufferToHexaDecimal(fileHash);
				document.getElementById("AttrHash").textContent  = attrHex;
				document.getElementById("OwnerHash").textContent = ownerHex;
				document.getElementById("FileHash").textContent  = fileHex;				
				return [attrHex, ownerHex, fileHex];
			})
			.then(hashes => {
				sendDocumentToWebWallet(hashes[0], hashes[1], hashes[2]).then(function(response) {
					console.log("Success!", response);
					document.getElementById("Transaction").textContent = response;
					document.getElementById("Explorer").innerHTML = "Once the block is mined, you can find your tranaction in "
					  + "<a href=\"https://documentchain.org/explorer/?search=" + response + "&testnet=true#dest\ target=\"_blank\">block explorer</a>.";
					// fill in HTML inputs for "Document Revision"
                  //document.getElementById("FileInput2").files = document.getElementById("FileInput").files;
					document.getElementById("TxInput2").value = response;
				}, function(error) {
					console.log("ERROR!", error);
					document.getElementById("Transaction").textContent = error;
				});
			});
		};
	    reader.readAsText(oFiles[0]);
		document.getElementById("FileSize").textContent = oFiles[0].size + " bytes";
	}
}

function outputVerification(htmlElement, currHash, blockHash) {
	var res = "";
	if (currHash == blockHash) {
		res = "<span style=\"color:green\">Confirmation, </span> " + currHash + " matches";
	}
	else {
		res = "<span style=\"color:red\">Hash deviates</span>"
		     + "<br> &nbsp; Current=" + currHash + "<br> &nbsp; on Blockchain=" + blockHash;
	}
	document.getElementById(htmlElement).innerHTML = res;
}

/* Document revision: Proof of Exists (PoE)
   Compare current file hash with blockchain data
*/
function revisionFile() {
	const oFiles = document.getElementById("FileInput2").files;
	const txid   = document.getElementById("TxInput2").value;
	
	if (oFiles.length == 1 ) {
		const reader = new FileReader();
		// optional attribute hash with descriptions of the document, like data from document management system
		const attrData = convertStringToArrayBufferView(oFiles[0].name + oFiles[0].size);
		// optional file owner data, note that we only store hashes of this data on blockchain
		const ownerData = convertStringToArrayBufferView("this could be the name, address, email, etc.");
	  
		reader.onload = function(e) {
			const fileData = convertStringToArrayBufferView(reader.result);
			var promiseAttrHash  = crypto.subtle.digest("SHA-256", attrData);
			var promiseOwnerHash = crypto.subtle.digest("SHA-256", ownerData);
			var promiseFileHash  = crypto.subtle.digest("SHA-512", fileData);
			var promiseTxData    = loadTransactionFromBlockchain(txid);

			Promise.all([promiseAttrHash, promiseOwnerHash, promiseFileHash, promiseTxData]).then(([attrHash, ownerHash, fileHash, jsonResponce]) => {
				// current hashes from local file
				const attrCurrHex  = convertArrayBufferToHexaDecimal(attrHash);
				const ownerCurrHex = convertArrayBufferToHexaDecimal(ownerHash);
				const fileCurrHex  = convertArrayBufferToHexaDecimal(fileHash);
				// stored hashes from blockchain, jsonResponce exammple: 
				// https://api.dms.cash/?api=getrawtransaction&id=DMSExposed&tx=dde0929040e6456a9ae012a24861601629f3c404433c990d9b873f69df4b7f43&verbose=1&testnet=1
				var blockchainHashes = new Array();
				jsonResponce.result.vout.forEach(vout => {
					if (vout.scriptPubKey.type == "nulldata" && vout.scriptPubKey.hex.startsWith("6a4c8d444d24")) {
						blockchainHashes = splitRawDataV2(vout.scriptPubKey.hex);
					}
				});

				// we verify that the three previously stored hashes match the current values
				outputVerification("AttrHash2",  attrCurrHex,  blockchainHashes['a022']);
				outputVerification("OwnerHash2", ownerCurrHex, blockchainHashes['b022']);
				outputVerification("FileHash2",  fileCurrHex,  blockchainHashes['f025']);
				// blockchain confirmations, we consider six confirmations as a minimum
				// jsonResponce.result.confirmations is undefined as long as the transaction is not mined in a block
				const confirmations = (jsonResponce.result.confirmations) ? jsonResponce.result.confirmations : 0;
				const htmlColor = (confirmations == 0) ? "red" : (confirmations < 6 ? "darkorange" : "green");
				document.getElementById("Confirmations2").innerHTML = `<span style="color:${htmlColor}">${confirmations} of 6</span>`;
			});
		};
	    reader.readAsText(oFiles[0]);
		document.getElementById("FileSize2").textContent = oFiles[0].size + " bytes";
	}
}
