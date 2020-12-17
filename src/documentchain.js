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
		console.log(rawdata);

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

function processFile() {
	const oFiles = document.getElementById("FileInput").files;
	
	if (oFiles.length == 1 ) {
		const reader = new FileReader();
		// optional attribute hash with descriptions of the document, like data from document management system
		const attrData = convertStringToArrayBufferView(oFiles[0].name + oFiles[0].size);
		// optional file owner data, note that we only store hashes of this data on blockchain
		const ownerData = convertStringToArrayBufferView("this could be the name, address, email, etc.");
	  
		reader.onload = function(e) {
			const fileData = convertStringToArrayBufferView(reader.result);
			var attrHex  = "";
			var ownerHex = "";
			var fileHex  = "";
			var promiseAttrHash  = crypto.subtle.digest("SHA-256", attrData);
			var promiseOwnerHash = crypto.subtle.digest("SHA-256", ownerData);
			var promiseFileHash  = crypto.subtle.digest("SHA-512", fileData);

			Promise.all([promiseAttrHash, promiseOwnerHash, promiseFileHash]).then(([attrHash, ownerHash, fileHash]) => {
				attrHex  = convertArrayBufferToHexaDecimal(attrHash);
				ownerHex = convertArrayBufferToHexaDecimal(ownerHash);
				fileHex  = convertArrayBufferToHexaDecimal(fileHash);
				/* Debug
				console.log(attrHash);
				console.log(ownerHash);
				console.log(fileHash);
				*/
				document.getElementById("AttrHash").textContent  = attrHex;
				document.getElementById("OwnerHash").textContent = ownerHex;
				document.getElementById("FileHash").textContent  = fileHex;
				
				return [attrHex, ownerHex, fileHex];
			})
			.then(hashes => {
				console.log(hashes);
				sendDocumentToWebWallet(hashes[0], hashes[1], hashes[2]).then(function(response) {
					console.log("Success!", response);
					document.getElementById("Transaction").textContent = response;
					document.getElementById("Explorer").innerHTML = "Once the block is mined, you can find your tranaction in "
					  + "<a href=\"https://documentchain.org/explorer/?search=" + response + "&testnet=true#dest\">block explorer</a>.";
				}, function(error) {
					console.log("ERROR!", error);
					document.getElementById("Transaction").textContent = error;
				});
			});
		};
	    reader.readAsText(oFiles[0]);
		document.getElementById("FileSize").innerHTML = oFiles[0].size + " bytes";
	}
}
