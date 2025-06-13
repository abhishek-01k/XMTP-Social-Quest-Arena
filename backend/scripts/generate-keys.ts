import { generateEncryptionKeyHex, createSigner } from "../src/helper";
import { appendToEnv } from "../src/helper";
import { getRandomValues } from "node:crypto";
import { toString } from "uint8arrays";

/**
 * Generate a random private key
 */
function generatePrivateKey(): string {
  const randomBytes = getRandomValues(new Uint8Array(32));
  return "0x" + toString(randomBytes, "hex");
}

/**
 * Generate XMTP keys and append to .env file
 */
async function generateKeys() {
  console.log("🔑 Generating XMTP keys...");

  try {
    // Generate wallet private key
    const walletKey = generatePrivateKey();
    console.log("✅ Generated wallet private key");

    // Generate encryption key
    const encryptionKey = generateEncryptionKeyHex();
    console.log("✅ Generated encryption key");

    // Create signer to get public key
    const signer = createSigner(walletKey);
    const identifier = await Promise.resolve(signer.getIdentifier());
    const publicKey = identifier.identifier;

    console.log("\n📝 Generated keys:");
    console.log("Private Key:", walletKey);
    console.log("Public Key:", publicKey);
    console.log("Encryption Key:", encryptionKey);

    // Append to .env file
    appendToEnv("WALLET_KEY", walletKey);
    appendToEnv("ENCRYPTION_KEY", encryptionKey);
    appendToEnv("XMTP_ENV", "dev");

    console.log("\n✅ Keys have been added to .env file");
    console.log("🎉 Setup complete! You can now run your XMTP agent.");

  } catch (error) {
    console.error("❌ Error generating keys:", error);
    process.exit(1);
  }
}

// Run the key generation
generateKeys().catch(console.error);
