const cacheName = 'cache-1.6.7';
const cachedFiles = [
    'jermaT.avif',
    'jermaComet.avif',
    'SubtitleIndex.json.gzip'
];

self.addEventListener('install', (_e) => {
    // console.debug('Installing service worker');
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== cacheName)
                    .map((key) => caches.delete(key))
            );
        })
    );
});

self.addEventListener('fetch', (e) => {
    // console.debug('Handling fetch event for', e.request.url);

    e.respondWith(
        caches.open(cacheName).then((cache) => {
            return cache
                .match(e.request)
                .then((response) => {
                    if (response) {
                        console.debug('Found response in cache:', response);
                        return response;
                    }

                    return fetch(e.request.clone()).then((response) => {
                        // console.debug('Response for %s from network is: %O', e.request.url, response);

                        if (response.status < 400 && cachedFiles.some(file => response.url.endsWith(file))) {
                            console.debug('Caching the response to', e.request.url);
                            cache.put(e.request, response.clone());
                        } else {
                            // console.debug('Not caching the response to', e.request.url);
                        }

                        return response;
                    });
                })
                .catch((error) => {
                    console.error('Error in fetch handler:', error);
                    throw error;
                });
        }),
    );
});
