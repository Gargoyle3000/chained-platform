export function createDiscoverChannelState(initialChannel = "nosy") {
  let channel = initialChannel === "curated" ? "curated" : "nosy";
  return Object.freeze({
    current: () => channel,
    select(value) {
      if (!["nosy", "curated"].includes(value)) throw new Error("INVALID DISCOVER CHANNEL");
      channel = value;
      return channel;
    }
  });
}
