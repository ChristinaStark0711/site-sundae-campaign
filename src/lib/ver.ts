// ?v=<rev> makes browsers and the image optimizer fetch a file again after the change workflow replaced it in place.
export const ver = (a: { rev?: number }) => (a.rev ? `?v=${a.rev}` : "");
