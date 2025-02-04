import m from 'mithril';
import '../styles/Settings.scss';

document.addEventListener('DOMContentLoaded', () => {
    // #region Font
    const storedFont = localStorage.getItem('font') || 'Courier New, monospace';
    changeSetting('font', storedFont);

    const checkedInput = document.querySelector(`input[value="${storedFont}"]`) as HTMLInputElement;
    if (checkedInput) {
        checkedInput.checked = true;
    }
    // #endregion

    // #region Loading method
    const synchronousLoadingCheckbox = document.getElementById('synchronous-loading') as HTMLInputElement | null;

    let storedSyncLoadingPreference = localStorage.getItem('synchronous-loading');

    if (!storedSyncLoadingPreference) {
        localStorage.setItem('synchronous-loading', 'false');
        storedSyncLoadingPreference = 'false';
    }

    if (synchronousLoadingCheckbox) {
        synchronousLoadingCheckbox.checked = storedSyncLoadingPreference === 'true';
    }
    // #endregion

    // #region Theme
    const storedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    changeSetting('theme', storedTheme);
    // #endregion
});

let hasPreloadedFonts: boolean = false;

function changeSetting(setting: string, value: string): void {
    switch (setting) {
        case 'font':
            localStorage.setItem('font', value);
            document.documentElement.style.setProperty('--fonts', value);
            break;
        case 'synchronous-loading':
            localStorage.setItem('synchronous-loading', value);
            break;
        case 'theme':
            localStorage.setItem('theme', value);

            document.documentElement.setAttribute('data-theme', value);

            document.querySelectorAll('.theme-choice button').forEach(element => element.classList.remove('selected'));

            const selectedButton = document.getElementById(value) as HTMLButtonElement;
            if (selectedButton) {
                selectedButton.classList.add('selected');
            }
            break;
    }
};

export function toggleSettingsModal(_e: Event) {
    function showSettingsModal(dialogElement: HTMLDialogElement) {
        if (!hasPreloadedFonts) {
            const fontURLs = [
                '/assets/fonts/OpenDyslexic/OpenDyslexic-Bold.woff2',
                '/assets/fonts/OpenDyslexic/OpenDyslexic-Italic.woff2',
                '/assets/fonts/OpenDyslexic/OpenDyslexic-Bold-Italic.woff2'
            ]

            fontURLs.forEach((url: string) => {
                const link = document.createElement('link');
                link.href = url;
                link.as = 'font';
                link.rel = 'preload';
                link.type = 'font/woff2';
                link.crossOrigin = 'anonymous';

                document.head.appendChild(link);
            });

            hasPreloadedFonts = true;
        }

        const dialog = document.getElementById('settings-dialog') as HTMLDialogElement;
        if (dialog) {
            dialogElement.showModal();
        }
    }

    const dialog = document.getElementById('settings-dialog') as HTMLDialogElement;
    if (dialog) {
        dialog.open ? dialog.close() : showSettingsModal(dialog);
    }
};

export const SettingsModal = () => {
    const themes = [
        'light',
        'dark',
        'dark-blue'
    ];

    const fonts = [
        { id: 'arial', name: 'Arial', value: 'Arial, sans-serif' },
        { id: 'courier-new', name: 'Courier New', value: 'Courier New, monospace' },
        { id: 'garamond', name: 'Garamond', value: 'Garamond, serif' },
        { id: 'georgia', name: 'Georgia', value: 'Georgia, serif' },
        { id: 'open-dyslexic', name: 'OpenDyslexic', value: 'OpenDyslexic, sans-serif' },
        { id: 'times-new-roman', name: 'Times New Roman', value: 'Times New Roman, serif' },
        { id: 'va11halla', name: 'VA-11 HALL-A', value: 'CyberpunkWaifus, sans-serif' },
        { id: 'verdana', name: 'Verdana', value: 'Verdana, sans-serif' }
    ];

    return {
        view: () => {
            return m('dialog#settings-dialog', [
                m('button#close-button', { autofocus: true, onclick: toggleSettingsModal }, [
                    m('svg.icon', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', role: 'img', 'aria-label': 'close icon' }, [
                        m('path', { d: 'M5.72 5.72a.75.75 0 0 1 1.06 0L12 10.94l5.22-5.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L13.06 12l5.22 5.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L12 13.06l-5.22 5.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L10.94 12 5.72 6.78a.75.75 0 0 1 0-1.06Z' })
                    ])
                ]),
                m('h2', 'Settings'),
                m('div#general-settings', [
                    m('label', { for: 'synchronous-loading' }, [
                        m('input#synchronous-loading', {
                            type: 'checkbox',
                            onchange: (e: Event) => {
                                const target = e.target as HTMLInputElement;
                                changeSetting('synchronous-loading', target.checked.toString());
                            }
                        }),
                        'Synchronous loading (much faster but might briefly freeze)'
                    ]),
                ]),
                m('h3', 'Theme'),
                m('div#theme-choice', [
                    themes.map(theme =>
                        m(`button.circle#${theme}`, { onclick: () => changeSetting('theme', theme) })
                    )
                ]),
                m('h3', 'Font'),
                m('div#font-choice', [
                    fonts.map(font =>
                        m('label', { for: font.id }, [
                            m(`input#${font.id}`, {
                                type: 'radio',
                                name: 'font',
                                value: font.value,
                                onchange: (e: Event) => {
                                    const target = e.target as HTMLInputElement;
                                    if (target) {
                                        changeSetting('font', target.value);
                                    }
                                    if (target.value === 'Times New Roman, serif') {
                                        window.open('https://www.youtube.com/watch?v=73gGwGI8Z7E&t=139s', '_blank');
                                    }
                                }
                            }),
                            font.name
                        ])
                    )
                ])
            ]);
        }
    };
};
