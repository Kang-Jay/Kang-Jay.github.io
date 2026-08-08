export function onRequest(context) {
  return context.env.LOGGER.fetch(context.request);
}
