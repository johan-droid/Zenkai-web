import process from "node:process";

async function main() {
  const res = await fetch("https://zenkai-web-gold.vercel.app/api/v1/manga/aa6c76f7-5f5f-46b6-a800-911145f81b9b/chapters?language=en");
  console.log("Status:", res.status);
  console.log("Headers:", Object.fromEntries(res.headers.entries()));
  const data = await res.json();
  console.log("Items count:", data.items?.length);
  if (data.items?.length) {
    console.log("First item:", data.items[0]);
    console.log("Item 1:", data.items[1]);
    console.log("Last item:", data.items[data.items.length - 1]);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
