export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = "NotFoundError";
  }
}

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** A profile to import that can't be loaded as it is; `itemId` is the file's id of the item. */
export class InvalidProfileError extends DomainError {
  constructor(
    readonly itemId: string | null,
    message: string,
  ) {
    super("invalid_profile", message);
    this.name = "InvalidProfileError";
  }
}
