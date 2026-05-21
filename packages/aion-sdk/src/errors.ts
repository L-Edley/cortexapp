export class AionUnavailableError extends Error {
  constructor(message = "AION core is unavailable") {
    super(message);
    this.name = "AionUnavailableError";
  }
}
