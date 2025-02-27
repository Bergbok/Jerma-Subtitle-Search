import m, { type Vnode } from 'mithril';
import { Secrets } from './Secrets.ts';
import type { SearchResult } from 'minisearch';
import { subtitles, subtitlesLoaded } from '../index.ts';
import '../styles/Results.scss';

let queryRegex: RegExp;
const expandState: Record<string, boolean> = {};

function debounce(func: Function, delay: number) {
    let timeoutId: ReturnType<typeof setTimeout>;

    return (...args: any[]) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
};

function formatTimestamp(timestamp: string): string {
    const [minutes, seconds] = timestamp.split(':').map(Number);
    let totalSeconds = Math.floor(minutes * 60 + seconds);
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
};

async function performSearch(query: string, signal: AbortSignal): Promise<SearchResult[]> {
    while (!subtitlesLoaded) {
        if (signal.aborted) throw new DOMException('Search aborted', 'AbortError');
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (signal.aborted) throw new DOMException('Search aborted', 'AbortError');

    // Accounts for punctuation within words, and timestamps between words
    const timeBeforeFilter = performance.now();

    queryRegex = new RegExp(
        '(?<=[^\\d\\[:.])' +
        query
            .split(/\s+/)
            .map((word, wordIndex, words) => {
                const chars = word.split('');
                return chars
                    .map((char, charIndex) => {
                        const isLastCharOfLastTerm = wordIndex === words.length - 1 && charIndex === chars.length - 1;
                        if (char === '*') {
                            return isLastCharOfLastTerm ? '' : '.*?';
                        }
                        return isLastCharOfLastTerm ? char : `${char}[^\\[A-Za-z0-9]*?`;
                    })
                    .join('') + '(?:\\[[\\d:.]+\\])?';
            })
            .join('')
            .slice(0, -1) + '{0}',
        'gi'
    );

    // console.debug('Query regex:', queryRegex);

    if (signal.aborted) throw new DOMException('Search aborted', 'AbortError');

    const result: SearchResult[] = subtitles.search(query, {
        combineWith: query.includes('*') ? 'OR' : 'AND',
        fuzzy: false,
        filter: (entry) => {
            queryRegex.lastIndex = 0;
            return queryRegex.test(entry.subtitles);
        }
    });

    console.debug(`Search took ${performance.now() - timeBeforeFilter}ms`);

    if (signal.aborted) throw new DOMException('Search aborted', 'AbortError');

    // console.debug('Search results:', result);

    Object.keys(expandState).forEach((key) => {
        delete expandState[key];
    });

    return result;
};

export async function seekEmbed(videoID: string, second: number) {
    const embed = document.querySelector(`lite-youtube[videoid='${videoID}']`);
    try {
        // @ts-ignore
        const player: YT.Player = await embed.getYTPlayer();
        player.seekTo(second, true);
    } catch {
        console.error('Failed to seek video', videoID);
    }
};

export const ResultsGrid = () => {
    const contextLevel = 1;
    const timestampRegex = new RegExp(/\[[\d:.]+\]/, 'g');
    let contextStart: number;
    let contextEnd: number;
    let currentPage: number = 1;
    let currentSearchController: AbortController | null = null;
    let hasSearched: boolean = false;
    let matchCount: number;
    let observedResultItem: Element | null = null;
    let previousQuery: string;
    let resultsPerPage: number;
    let searchQuery: string;
    let searchResults: SearchResult[] = [];
    let visibleResults: SearchResult[] = [];

    const debouncedSearch = debounce(async (query: string) => {
        if (currentSearchController) {
            currentSearchController.abort();
        }

        currentSearchController = new AbortController();
        const { signal } = currentSearchController;

        try {
            searchResults = await performSearch(query, signal);
            hasSearched = true;
            m.redraw();
        } catch (e) {
            if ((e as DOMException).name === 'AbortError') {
                // console.debug('Previous search aborted');
            } else {
                throw e;
            }
        }
    }, 690);

    let paginationObserver = new IntersectionObserver(
        (entries: IntersectionObserverEntry[]) => {
            const lastResultItem = entries[0];
            if (!lastResultItem.isIntersecting || searchResults.length <= currentPage * resultsPerPage) return;
            currentPage++;
            m.redraw();
        },
        {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        }
    );

    return {
        onupdate: () => {
            if (subtitlesLoaded) {
                const lastResultItem = document.querySelector('.result-item:last-child');
                if (lastResultItem && lastResultItem !== observedResultItem) {
                    if (observedResultItem) {
                        paginationObserver.unobserve(observedResultItem);
                    }
                    paginationObserver.observe(lastResultItem);
                    observedResultItem = lastResultItem;
                }
            }

            const resultCountElement = document.querySelector('#results > h2');
            if (resultCountElement) {
                resultCountElement.textContent = `Found ${matchCount} matches across ${searchResults.length} videos`;
            }
        },
        view: (vnode: Vnode<{ query: string }>) => {
            if (!vnode.attrs.query || !subtitlesLoaded) {
                return;
            }

            if (vnode.attrs.query !== previousQuery) {
                searchQuery = vnode.attrs.query;
                currentPage = 1;
                debouncedSearch(searchQuery);
            }

            previousQuery = vnode.attrs.query;

            if (!hasSearched) {
                return;
            }

            resultsPerPage = parseInt(localStorage.getItem('render-amount') || (window.innerWidth <= 768 ? '100' : '200'));

            if (resultsPerPage === 0) {
                visibleResults = searchResults;
            } else {
                visibleResults = searchResults.slice(0, currentPage * resultsPerPage);
            }

            matchCount = 0;

            return m('div#results', [
                m('h1', `Results for "${searchQuery}"`),
                m('h2'),
                m('ul#results-list', [
                    visibleResults.map((result) => {
                        let match: RegExpExecArray | null;
                        const matches: { index: number; match: string }[] = [];

                        queryRegex.lastIndex = 0;

                        while (match = queryRegex.exec(result.subtitles)) {
                            matches.push({ index: match.index, match: match[0] });
                            matchCount++;
                        }

                        if (matches.length === 0) return;

                        const isExpanded = expandState[result.id] || false;
                        const displayedMatches = isExpanded ? matches : matches.slice(0, 3);

                        return m('li.result-item', [
                            [m('lite-youtube.video-embed', {
                                key: `${result.id}${searchQuery}`,
                                'js-api': true,
                                params: 'color=white', // https://developers.google.com/youtube/player_parameters
                                style: `background-image: url('${result.thumbnail}')`,
                                title: result.title,
                                videoid: result.id
                            })],
                            m('div.video-info', [
                                m('h3#title', result.title),
                                m('p#duration', [
                                    m('b', 'Duration: '),
                                    result.duration
                                ]),
                                m('p#upload-date', [
                                    m('b', 'Uploaded: '),
                                    result.upload_date
                                ]),
                                m('p#stream-title', [
                                    m('b', 'Stream Title: '),
                                    result.stream_title || 'N/A'
                                ]),
                                m('p#stream-date', [
                                    m('b', 'Streamed: '),
                                    result.stream_date || 'N/A'
                                ])
                            ]),
                            m('ul.subtitle-matches',
                                displayedMatches.map((match) => {
                                    const elements: Vnode[] = [];

                                    contextStart = match.index - 1;
                                    contextEnd = match.index + match.match.length;
                                    let bracketsFound = 0;

                                    while (contextStart > 0 && bracketsFound < contextLevel + 1) {
                                        contextStart--;
                                        if (result.subtitles[contextStart] === '[') {
                                            bracketsFound++;
                                        }
                                    }

                                    bracketsFound = 0;

                                    while (contextEnd < result.subtitles.length && bracketsFound < contextLevel + 1) {
                                        if (result.subtitles[contextEnd + 1] === '[') {
                                            bracketsFound++;
                                        }
                                        contextEnd++;
                                    }

                                    const context = result.subtitles.slice(contextStart, contextEnd);
                                    const highlights = context.match(queryRegex)[0].split(timestampRegex) || [];

                                    const contextLines = context.split('[').slice(1);
                                    contextLines.forEach((line: string) => {
                                        const [timestamp, text] = line.split(']');
                                        const splitTimestamp = timestamp.split(':');
                                        const second = parseInt(splitTimestamp[0]) * 60 + parseInt(splitTimestamp[1]);

                                        elements.push(
                                            m('li.line', [
                                                m('button.seek', {
                                                    onclick: (e: Event) => {
                                                        // @ts-ignore
                                                        e.redraw = false;
                                                        seekEmbed(result.id, second);
                                                    },
                                                    oncontextmenu: (e: MouseEvent) => {
                                                        // @ts-ignore
                                                        e.redraw = false;
                                                        e.preventDefault();
                                                    },
                                                    onmouseup: (e: MouseEvent) => {
                                                        // @ts-ignore
                                                        e.redraw = false;
                                                        if (e.button === 1) {
                                                            e.preventDefault();
                                                            window.open(`https://www.youtube.com/watch?v=${result.id}&t=${second}s`, '_blank');
                                                        } else if (e.button === 2) {
                                                            e.preventDefault();
                                                            navigator.clipboard.write([
                                                                new ClipboardItem({
                                                                    'text/plain': `https://www.youtube.com/watch?v=${result.id}&t=${second}s`
                                                                })
                                                            ]);
                                                        }
                                                    },
                                                    ontouchstart: (e: TouchEvent) => {
                                                        // @ts-ignore
                                                        e.redraw = false;
                                                        const touchDuration = 420;
                                                        const timer = setTimeout(() => {
                                                            window.open(`https://www.youtube.com/watch?v=${result.id}&t=${second}s`, '_blank');
                                                        }, touchDuration);
                                                        if (e.currentTarget) {
                                                            e.currentTarget.addEventListener('touchend', () => clearTimeout(timer));
                                                        }
                                                    }
                                                }, formatTimestamp(timestamp)),
                                                // This is kinda cursed, but it works
                                                // Maybe once FlexSearch matures this can be done more elegantly (v0.8 should return highlights along with search results)
                                                (() => {
                                                    let offset = 0;
                                                    const indices: { start: number; end: number }[] = [];
                                                    const lowerText = text.toLowerCase();

                                                    highlights.forEach((h: string) => {
                                                        const lowerHighlight = h.toLowerCase();
                                                        let pos = 0;
                                                        while ((pos = lowerText.indexOf(lowerHighlight, pos)) !== -1) {
                                                            indices.push({ start: pos, end: pos + h.length });
                                                            pos += h.length;
                                                        }
                                                    });

                                                    indices.sort((a, b) => a.start - b.start);

                                                    const fragments: (m.Vnode | string)[] = [];
                                                    indices.forEach(({ start, end }) => {
                                                        if (start > offset) {
                                                            fragments.push(text.slice(offset, start));
                                                        }
                                                        fragments.push(m('mark', text.slice(start, end)));
                                                        offset = end;
                                                    });
                                                    if (offset < text.length) {
                                                        fragments.push(text.slice(offset));
                                                    }

                                                    return fragments;
                                                })()
                                            ])
                                        );
                                    });

                                    return m('li.match', [
                                        elements,
                                        m('hr')
                                    ]);
                                })
                            ),
                            matches.length > 3 &&
                                m('button.show-more', { onclick: () => expandState[result.id] = !expandState[result.id] }, [
                                    isExpanded ?
                                        m('svg.icon', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', role: 'img', 'aria-label': 'upwards chevron' }, [
                                            m('path', { d: 'M18.78 15.78a.749.749 0 0 1-1.06 0L12 10.061 6.28 15.78a.749.749 0 1 1-1.06-1.06l6.25-6.25a.749.749 0 0 1 1.06 0l6.25 6.25a.749.749 0 0 1 0 1.06Z' })
                                        ])
                                        :
                                        [`${matches.length - 3} more`,
                                        m('svg.icon', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', role: 'img', 'aria-label': 'downwards chevron' }, [
                                            m('path', { d: 'M5.22 8.22a.749.749 0 0 0 0 1.06l6.25 6.25a.749.749 0 0 0 1.06 0l6.25-6.25a.749.749 0 1 0-1.06-1.06L12 13.939 6.28 8.22a.749.749 0 0 0-1.06 0Z' })
                                        ])]
                                ])
                        ]);
                    })
                ]),
                searchResults.length === 0 &&
                m('div#page-info', [
                    m('section', [
                        m('h2', 'Not finding what you\'re looking for?'),
                        m('section#query-tips', [
                            m('ul', [
                                m('li', 'For numbers: try different combinations of typing out and digitizing.'),
                                m('li', 'Substitute potential special characters with spaces or a wildcard (*).')
                            ]),
                            m('p', [
                                'Wildcard characters (*) match zero or more characters.',
                                m('br'),
                                'Spaces match non-alphanumeric characters.'
                            ])
                        ]),
                        m('section#advanced-usage', [
                            m('h3', 'Advanced Usage'),
                            m('p', [
                                'You can interact with the underlying ',
                                m('a', { href: 'https://github.com/lucaong/minisearch' }, 'MiniSearch'),
                                ' instance in your browser console.',
                                m('br'),
                                'It\'s accessible from a global variable called ',
                                m('code', 'subtitles'),
                                '.',
                                m('br'),
                                'For example: ',
                                m('code', `subtitles.search(\'${searchQuery}\', { combineWith: 'OR', fuzzy: true })`)
                            ]),
                            m('p', [
                                'The subtitle files are also downloadable if you\'d like to search through them externally.',
                                m('br'),
                                'Individual files are on ',
                                m('a', { href: 'https://github.com/Bergbok/Jerma-Subtitle-Search/tree/main/src/assets/subtitles' }, 'GitHub'),
                                ' and the bundled JSON is available ',
                                m('a', { href: 'https://subtitlefiles.jerma.io/file/jerma-subtitles/Subtitles.json' }, 'here'),
                                '.'
                            ])
                        ])
                    ])
                ]),
                m(Secrets, { query: vnode.attrs.query })
                // m('div#page-end', [
                //     m('h5', "You've reached the end")
                // ])
            ]);
        }
    };
};
