import { useIntl } from "@cookbook/solid-intl";
import { A, useParams } from "@solidjs/router";
import { batch, Component, createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { APP_ID } from "../App";
import { Kind } from "../constants";
import { useAccountContext } from "../contexts/AccountContext";
import { decodeIdentifier } from "../lib/keys";
import { getParametrizedEvent, sendEvent, setLinkPreviews } from "../lib/notes";
import { subscribeTo, subsTo } from "../sockets";
import { SolidMarkdown } from "solid-markdown";

import styles from './Longform.module.scss';
import Loader from "../components/Loader/Loader";
import { FeedPage, NostrEventContent, NostrMentionContent, NostrNoteActionsContent, NostrNoteContent, NostrStatsContent, NostrTier, NostrUserContent, NoteActions, PrimalArticle, PrimalNote, PrimalUser, SendNoteResult, TopZap, ZapOption } from "../types/primal";
import { getUserProfileInfo, getUserProfiles } from "../lib/profile";
import { convertToUser, nip05Verification, userName } from "../stores/profile";
import Avatar from "../components/Avatar/Avatar";
import { shortDate } from "../lib/dates";

import hljs from 'highlight.js'

import mdFoot from 'markdown-it-footnote';
import { full as mdEmoji } from 'markdown-it-emoji';

import PrimalMarkdown from "../components/PrimalMarkdown/PrimalMarkdown";
import NoteTopZaps from "../components/Note/NoteTopZaps";
import { parseBolt11, uuidv4 } from "../utils";
import Note, { NoteReactionsState } from "../components/Note/Note";
import NoteFooter from "../components/Note/NoteFooter/NoteFooter";
import { getArticleThread, getAuthorSubscriptionTiers, getThread } from "../lib/feed";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import NoteImage from "../components/NoteImage/NoteImage";
import { nip19 } from "nostr-tools";
import { saveNotes } from "../services/StoreService";
import { sortByRecency, convertToNotes, convertToArticles } from "../stores/note";
import { tableNodeTypes } from "@milkdown/prose/tables";
import VerificationCheck from "../components/VerificationCheck/VerificationCheck";
import BookmarkArticle from "../components/BookmarkNote/BookmarkArticle";
import NoteContextTrigger from "../components/Note/NoteContextTrigger";
import { CustomZapInfo, useAppContext } from "../contexts/AppContext";
import ArticleFooter from "../components/Note/NoteFooter/ArticleFooter";
import { thread } from "../translations";
import { useThreadContext } from "../contexts/ThreadContext";
import Wormhole from "../components/Wormhole/Wormhole";
import Search from "../components/Search/Search";
import ArticleSidebar from "../components/HomeSidebar/ArticleSidebar";
import ReplyToNote from "../components/ReplyToNote/ReplyToNote";
import { sanitize } from "dompurify";
import { fetchNotes } from "../handleNotes";
import { Tier, TierCost } from "../components/SubscribeToAuthorModal/SubscribeToAuthorModal";
import ButtonPrimary from "../components/Buttons/ButtonPrimary";
import { zapSubscription } from "../lib/zap";

export type LongFormData = {
  title: string,
  summary: string,
  image: string,
  tags: string[],
  published: number,
  content: string,
  author: string,
  topZaps: TopZap[],
  id: string,
  client: string,
};

export type LongformThreadStore = {
  article: PrimalArticle | undefined,
  page: FeedPage,
  replies: PrimalNote[],
  users: PrimalUser[],
  isFetching: boolean,
  lastReply: PrimalNote | undefined,
  hasTiers: boolean,
}

const emptyArticle = {
  title: '',
  summary: '',
  image: '',
  tags: [],
  published: 0,
  content: '',
  author: '',
  topZaps: [],
  id: '',
  client: '',
};

const emptyStore: LongformThreadStore = {
  article: undefined,
  replies: [],
  page: {
    messages: [],
    users: {},
    postStats: {},
    mentions: {},
    noteActions: {},
    topZaps: {},
    wordCount: {},
  },
  users: [],
  isFetching: false,
  lastReply: undefined,
  hasTiers: false,
}

const test = `
# h1 Heading 8-)
## h2 Heading
### h3 Heading
#### h4 Heading
##### h5 Heading
###### h6 Heading

## Mentions

nostr:npub19f2765hdx8u9lz777w7azed2wsn9mqkf2gvn67mkldx8dnxvggcsmhe9da

nostr:note1tv033d7y088x8e90n5ut8htlsyy4yuwsw2fpgywq62w8xf0qcv8q8xvvhg


## Horizontal Rules

___

---

***


## Typographic replacements

Enable typographer option to see result.

(c) (C) (r) (R) (tm) (TM) (p) (P) +-

test.. test... test..... test?..... test!....

!!!!!! ???? ,,  -- ---

"Smartypants, double quotes" and 'single quotes'


## Emphasis

**This is bold text**

__This is bold text__

*This is italic text*

_This is italic text_

~~Strikethrough~~


## Blockquotes


> Blockquotes can also be nested...
>> ...by using additional greater-than signs right next to each other...
> > > ...or with spaces between arrows.


## Lists

Unordered

+ Create a list by starting a line with \`+\`, \`-\`, or \`*\`
+ Sub-lists are made by indenting 2 spaces:
  - Marker character change forces new list start:
    * Ac tristique libero volutpat at
    + Facilisis in pretium nisl aliquet
    - Nulla volutpat aliquam velit
+ Very easy!

Ordered

1. Lorem ipsum dolor sit amet
2. Consectetur adipiscing elit
3. Integer molestie lorem at massa


## Code

Inline \`code\`

Indented code

    // Some comments
    line 1 of code
    line 2 of code
    line 3 of code


Block code "fences"

\`\`\`
Sample text here...
\`\`\`

Syntax highlighting

\`\`\` js
var foo = function (bar) {
  return bar++;
};

console.log(foo(5));
\`\`\`

## Tables

| Option | Description |
| ------ | ----------- |
| data   | path to data files to supply the data that will be passed into templates. |
| engine | engine to be used for processing templates. Handlebars is the default. |
| ext    | extension to be used for dest files. |

Right aligned columns

| Option | Description |
| ------:| -----------:|
| data   | path to data files to supply the data that will be passed into templates. |
| engine | engine to be used for processing templates. Handlebars is the default. |
| ext    | extension to be used for dest files. |


## Links

[link text](http://dev.nodeca.com)

[link with title](http://nodeca.github.io/pica/demo/ "title text!")

Autoconverted link https://github.com/nodeca/pica (enable linkify to see)


## Images

![Minion](https://octodex.github.com/images/minion.png)
![Stormtroopocat](https://octodex.github.com/images/stormtroopocat.jpg "The Stormtroopocat")[^image]

Like links, Images also have a footnote style syntax

With a reference later in the document defining the URL location, like this:

[^image]: https://octodex.github.com/images/dojocat.jpg  "The Dojocat"


## Optionals (should we support them?)

### [Subscript](https://github.com/markdown-it/markdown-it-sub) / [Superscript](https://github.com/markdown-it/markdown-it-sup)

- 19^th^
- H~2~O


### [\<ins>](https://github.com/markdown-it/markdown-it-ins)

there is some ++Inserted text++ here


### [\<mark>](https://github.com/markdown-it/markdown-it-mark)

==Marked text==


### [Footnotes](https://github.com/markdown-it/markdown-it-footnote)

Footnote 1 link[^first].

Footnote 2 link[^second].

Duplicated footnote reference[^second].

[^first]: Footnote **can have markup**

    and multiple paragraphs.

[^second]: Footnote text.


### [Definition lists](https://github.com/markdown-it/markdown-it-deflist)

Term 1

:   Definition 1
with lazy continuation.

Term 2 with *inline markup*

:   Definition 2

        { some code, part of Definition 2 }

    Third paragraph of definition 2.

`;

const Longform: Component< { naddr: string } > = (props) => {
  const account = useAccountContext();
  const app = useAppContext();
  const thread = useThreadContext();
  const params = useParams();
  const intl = useIntl();

  // const [article, setArticle] = createStore<LongFormData>({...emptyArticle});
  const [store, updateStore] = createStore<LongformThreadStore>({ ...emptyStore })

  // const [pubkey, setPubkey] = createSignal<string>('');

  // @ts-ignore
  const [author, setAuthor] = createStore<PrimalUser>();

  const naddr = () => props.naddr;

  let latestTopZap: string = '';
  let latestTopZapFeed: string = '';
  let articleContextMenu: HTMLDivElement | undefined;

  const [reactionsState, updateReactionsState] = createStore<NoteReactionsState>({
    likes: 0,
    liked: false,
    reposts: 0,
    reposted: false,
    replies: 0,
    replied: false,
    zapCount: 0,
    satsZapped: 0,
    zapped: false,
    zappedAmount: 0,
    zappedNow: false,
    isZapping: false,
    showZapAnim: false,
    hideZapIcon: false,
    moreZapsAvailable: false,
    isRepostMenuVisible: false,
    topZaps: [],
    topZapsFeed: [],
    quoteCount: 0,
  });


  const lightbox = new PhotoSwipeLightbox({
    gallery: `#read_${naddr()}`,
    children: `a.hero_image_${naddr()}`,
    showHideAnimationType: 'zoom',
    initialZoomLevel: 'fit',
    secondaryZoomLevel: 2,
    maxZoomLevel: 3,
    pswpModule: () => import('photoswipe')
  });

  onMount(() => {
    lightbox.init();
    clearArticle();
    fetchArticle();
  });

  createEffect(() => {
    if (store.article?.user) {
      getTiers(store.article.user);
    }
  });

  const getTiers = (author: PrimalUser) => {
    if (!author) return;

    const subId = `article_tiers_${APP_ID}`;

    const unsub = subsTo(subId, {
      onEvent: (_, content) => {
        if (content.kind === Kind.TierList) {
          return;
        }

        if (content.kind === Kind.Tier) {
          updateStore('hasTiers', () => true);

          return;
        }
      },
      onEose: () => {
        unsub();
      },
    })

    getAuthorSubscriptionTiers(author.pubkey, subId)
  }

  const doSubscription = async (tier: Tier, cost: TierCost, exchangeRate?: Record<string, Record<string, number>>) => {
    const a = store.article?.user;

    if (!a || !account || !cost) return;

    const subEvent = {
      kind: Kind.Subscribe,
      content: '',
      created_at: Math.floor((new Date()).getTime() / 1_000),
      tags: [
        ['p', a.pubkey],
        ['e', tier.id],
        ['amount', cost.amount, cost.unit, cost.cadence],
        ['event', JSON.stringify(tier.event)],
        // Copy any zap splits
        ...(tier.event.tags?.filter(t => t[0] === 'zap') || []),
      ],
    }

    const { success, note } = await sendEvent(subEvent, account.relays, account.relaySettings);

    if (success && note) {
      const isZapped = await zapSubscription(note, a, account.publicKey, account.relays, exchangeRate);

      if (!isZapped) {
        unsubscribe(note.id);
      }
    }
  }

  const unsubscribe = async (eventId: string) => {
    const a = store.article?.user;

    if (!a || !account) return;

    const unsubEvent = {
      kind: Kind.Unsubscribe,
      content: '',
      created_at: Math.floor((new Date()).getTime() / 1_000),

      tags: [
        ['p', a.pubkey],
        ['e', eventId],
      ],
    };

    await sendEvent(unsubEvent, account.relays, account.relaySettings);

  }

  const openSubscribe = () => {
    app?.actions.openAuthorSubscribeModal(store.article?.user, doSubscription);
  };

  const onConfirmZap = (zapOption: ZapOption) => {
    app?.actions.closeCustomZapModal();
    batch(() => {
      updateReactionsState('zappedAmount', () => zapOption.amount || 0);
      updateReactionsState('satsZapped', (z) => z + (zapOption.amount || 0));
      updateReactionsState('zapped', () => true);
      updateReactionsState('showZapAnim', () => true)
    });

    addTopZap(zapOption);
    addTopZapFeed(zapOption)
  };

  const onSuccessZap = (zapOption: ZapOption) => {
    app?.actions.closeCustomZapModal();
    app?.actions.resetCustomZap();

    const pubkey = account?.publicKey;

    if (!pubkey) return;

    batch(() => {
      updateReactionsState('zapCount', (z) => z + 1);
      updateReactionsState('isZapping', () => false);
      updateReactionsState('showZapAnim', () => false);
      updateReactionsState('hideZapIcon', () => false);
      updateReactionsState('zapped', () => true);
    });
  };

  const onFailZap = (zapOption: ZapOption) => {
    app?.actions.closeCustomZapModal();
    app?.actions.resetCustomZap();
    batch(() => {
      updateReactionsState('zappedAmount', () => -(zapOption.amount || 0));
      updateReactionsState('satsZapped', (z) => z - (zapOption.amount || 0));
      updateReactionsState('isZapping', () => false);
      updateReactionsState('showZapAnim', () => false);
      updateReactionsState('hideZapIcon', () => false);
      updateReactionsState('zapped', () => store.article ? store.article.noteActions.zapped : false);
    });

    removeTopZap(zapOption);
    removeTopZapFeed(zapOption);
  };

  const onCancelZap = (zapOption: ZapOption) => {
    app?.actions.closeCustomZapModal();
    app?.actions.resetCustomZap();
    batch(() => {
      updateReactionsState('zappedAmount', () => -(zapOption.amount || 0));
      updateReactionsState('satsZapped', (z) => z - (zapOption.amount || 0));
      updateReactionsState('isZapping', () => false);
      updateReactionsState('showZapAnim', () => false);
      updateReactionsState('hideZapIcon', () => false);
      updateReactionsState('zapped', () => store.article ? store.article.noteActions.zapped : false);
    });

    removeTopZap(zapOption);
    removeTopZapFeed(zapOption);
  };

  const addTopZap = (zapOption: ZapOption) => {
    const pubkey = account?.publicKey;

    if (!pubkey || !store.article) return;

    const oldZaps = [ ...reactionsState.topZaps ];

    latestTopZap = uuidv4() as string;

    const newZap = {
      amount: zapOption.amount || 0,
      message: zapOption.message || '',
      pubkey,
      eventId: store.article.id,
      id: latestTopZap,
    };

    if (!store.users.find((u) => u.pubkey === pubkey)) {
      const subId = `article_pk_${APP_ID}`;

      const unsub = subscribeTo(subId, (type, _, content) =>{
        if (type === 'EOSE') {
          unsub();
          savePage(store.page);
          return;
        }

        if (type === 'EVENT') {
          content && updatePage(content);
        }
      });

      getUserProfiles([pubkey], subId);
    }

    const zaps = [ ...oldZaps, { ...newZap }].sort((a, b) => b.amount - a.amount);
    updateReactionsState('topZaps', () => [...zaps]);
  };

  const removeTopZap = (zapOption: ZapOption) => {
    const zaps = reactionsState.topZaps.filter(z => z.id !== latestTopZap);
    updateReactionsState('topZaps', () => [...zaps]);
  };


  const addTopZapFeed = (zapOption: ZapOption) => {
    const pubkey = account?.publicKey;

    if (!pubkey || !store.article) return;

    const oldZaps = [ ...reactionsState.topZapsFeed ];

    latestTopZapFeed = uuidv4() as string;

    const newZap = {
      amount: zapOption.amount || 0,
      message: zapOption.message || '',
      pubkey,
      eventId: store.article.id,
      id: latestTopZapFeed,
    };

    const zaps = [ ...oldZaps, { ...newZap }].sort((a, b) => b.amount - a.amount).slice(0, 4);
    updateReactionsState('topZapsFeed', () => [...zaps]);
  }

  const removeTopZapFeed = (zapOption: ZapOption) => {
    const zaps = reactionsState.topZapsFeed.filter(z => z.id !== latestTopZapFeed);
    updateReactionsState('topZapsFeed', () => [...zaps]);
  };

  const customZapInfo: () => CustomZapInfo = () => ({
    note: store.article,
    onConfirm: onConfirmZap,
    onSuccess: onSuccessZap,
    onFail: onFailZap,
    onCancel: onCancelZap,
  });

  const clearArticle = () => {
    // setArticle(() => ({ ...emptyArticle }));
    updateStore(() => ({ ...emptyStore }));
  };

  const fetchArticle = () => {
    const decoded = decodeIdentifier(naddr());

    const { pubkey, identifier, kind } = decoded.data;

    if (kind !== Kind.LongForm) return;

    const subId = `naddr_${naddr()}_${APP_ID}`;

    const unsub = subscribeTo(subId, (type, subId, content) =>{
      if (type === 'EOSE') {
        unsub();
        savePage(store.page);
        return;
      }

      if (type === 'EVENT') {
        content && updatePage(content);
      }
    });

    updateStore('isFetching', () => true);

    updateStore('page', () => ({
      messages: [],
      users: {},
      postStats: {},
      mentions: {},
      noteActions: {},
      topZaps: {},
      wordCount: {},
    }));

    getArticleThread(account?.publicKey, pubkey, identifier, kind, subId);
  }

  const updatePage = (content: NostrEventContent) => {
    if (content.kind === Kind.Metadata) {
      const user = content as NostrUserContent;

      updateStore('page', 'users',
        (usrs) => ({ ...usrs, [user.pubkey]: { ...user } })
      );

      return;
    }

    // if (content.kind === Kind.LongForm) {

    //   let n: LongFormData = {
    //     title: '',
    //     summary: '',
    //     image: '',
    //     tags: [],
    //     published: content.created_at || 0,
    //     content: content.content,
    //     author: content.pubkey,
    //     topZaps: [],
    //     id: content.id,
    //     client: '',
    //   }

    //   content.tags.forEach(tag => {
    //     switch (tag[0]) {
    //       case 't':
    //         n.tags.push(tag[1]);
    //         break;
    //       case 'title':
    //         n.title = tag[1];
    //         break;
    //       case 'summary':
    //         n.summary = tag[1];
    //         break;
    //       case 'image':
    //         n.image = tag[1];
    //         break;
    //       case 'published':
    //         n.published = parseInt(tag[1]);
    //         break;
    //       case 'content':
    //         n.content = tag[1];
    //         break;
    //       case 'author':
    //         n.author = tag[1];
    //         break;
    //       case 'client':
    //         n.client = tag[1];
    //         break;
    //       default:
    //         break;
    //     }
    //   });

    //   setArticle(n);
    //   return;
    // }

    if ([Kind.LongForm, Kind.Text, Kind.Repost].includes(content.kind)) {
      const message = content as NostrNoteContent;

      if (store.lastReply?.noteId !== nip19.noteEncode(message.id)) {
        updateStore('page', 'messages',
          (msgs) => [ ...msgs, { ...message }]
        );
      }

      return;
    }

    if (content.kind === Kind.NoteStats) {
      const statistic = content as NostrStatsContent;
      const stat = JSON.parse(statistic.content);

      updateStore('page', 'postStats',
        (stats) => ({ ...stats, [stat.event_id]: { ...stat } })
      );
      return;
    }

    if (content.kind === Kind.Mentions) {
      const mentionContent = content as NostrMentionContent;
      const mention = JSON.parse(mentionContent.content);

      updateStore('page', 'mentions',
        (mentions) => ({ ...mentions, [mention.id]: { ...mention } })
      );
      return;
    }

    if (content.kind === Kind.NoteActions) {
      const noteActionContent = content as NostrNoteActionsContent;
      const noteActions = JSON.parse(noteActionContent.content) as NoteActions;

      updateStore('page', 'noteActions',
        (actions) => ({ ...actions, [noteActions.event_id]: { ...noteActions } })
      );
      return;
    }

    if (content.kind === Kind.LinkMetadata) {
      const metadata = JSON.parse(content.content);

      const data = metadata.resources[0];
      if (!data) {
        return;
      }

      const preview = {
        url: data.url,
        title: data.md_title,
        description: data.md_description,
        mediaType: data.mimetype,
        contentType: data.mimetype,
        images: [data.md_image],
        favicons: [data.icon_url],
      };

      setLinkPreviews(() => ({ [data.url]: preview }));
      return;
    }

    if (content.kind === Kind.RelayHint) {
      const hints = JSON.parse(content.content);
      updateStore('page', 'relayHints', (rh) => ({ ...rh, ...hints }));
    }

    if (content?.kind === Kind.Zap) {
      const zapTag = content.tags.find(t => t[0] === 'description');

      if (!zapTag) return;

      const zapInfo = JSON.parse(zapTag[1] || '{}');

      let amount = '0';

      let bolt11Tag = content?.tags?.find(t => t[0] === 'bolt11');

      if (bolt11Tag) {
        try {
          amount = `${parseBolt11(bolt11Tag[1]) || 0}`;
        } catch (e) {
          const amountTag = zapInfo.tags.find((t: string[]) => t[0] === 'amount');

          amount = amountTag ? amountTag[1] : '0';
        }
      }

      const eventId = (zapInfo.tags.find((t: string[]) => t[0] === 'e') || [])[1];

      const zap: TopZap = {
        id: zapInfo.id,
        amount: parseInt(amount || '0'),
        pubkey: zapInfo.pubkey,
        message: zapInfo.content,
        eventId,
      };

      // if (article.id === zap.eventId && !article.topZaps.find(i => i.id === zap.id)) {
      //   const newZaps = [ ...article.topZaps, { ...zap }].sort((a, b) => b.amount - a.amount);
      //   setArticle('topZaps', (zaps) => [ ...newZaps ]);
      // }

      const oldZaps = store.page.topZaps[eventId];

      if (oldZaps === undefined) {
        updateStore('page', 'topZaps', () => ({ [eventId]: [{ ...zap }]}));
        return;
      }

      if (oldZaps.find(i => i.id === zap.id)) {
        return;
      }

      const newZaps = [ ...oldZaps, { ...zap }].sort((a, b) => b.amount - a.amount);

      updateStore('page', 'topZaps', eventId, () => [ ...newZaps ]);

      return;
    }
  };

  const savePage = (page: FeedPage) => {
    const pageWithNotes = {
      ...page,
      messages: page.messages.filter(m => m.kind === Kind.Text)
    }
    const users = Object.values(page.users).map(convertToUser);

    const replies = sortByRecency(convertToNotes(pageWithNotes, pageWithNotes.topZaps));
    const articles = convertToArticles(page, page.topZaps);

    const article = articles.find(a => a.noteId === naddr());

    updateStore('users', () => [ ...users ]);

    updateStore('replies', (notes) => [ ...notes, ...replies ]);

    updateStore('article', () => ({ ...article }));

    updateStore('isFetching', () => false);
    // saveNotes(replies);

    // const a = users.find(u => u.pubkey === article.author);

    // if (a) {
    //   setAuthor(() => ({ ...a }));
    // }
  };

  // const saveNotes = (newNotes: PrimalNote[], scope?: 'future') => {
  // };

  const openReactionModal = (openOn = 'likes') =>  {
    if (!store.article) return;

    app?.actions.openReactionModal(store.article.id, {
      likes: reactionsState.likes,
      zaps: reactionsState.zapCount,
      reposts: reactionsState.reposts,
      quotes: reactionsState.quoteCount,
      openOn,
    });
  };

  const onContextMenuTrigger = () => {
    if (!store.article) return;

    app?.actions.openContextMenu(
      store.article,
      articleContextMenu?.getBoundingClientRect(),
      () => {
        app?.actions.openCustomZapModal(customZapInfo());
      },
      openReactionModal,
    );
  }


  const onReplyPosted = async (result: SendNoteResult) => {
    const { success, note } = result;

    if (!success || !note || !account) return;

    const replies = await fetchNotes(account.publicKey, [note.id], `reads_reply_${APP_ID}`);

    updateStore('replies', (reps) => [ ...replies, ...reps]);
  };

  return (
    <>
      <Wormhole
        to="search_section"
      >
        <Search />
      </Wormhole>
      <Wormhole to='right_sidebar'>
        <ArticleSidebar
          user={store.article?.user}
          article={store.article}
        />
      </Wormhole>
      <div class={styles.header}>
        <A href={`/p/${store.article?.user.npub}`}>
          <div class={styles.author}>
            <Show when={store.article?.user}>
                <Avatar user={store.article?.user} size="xs" />

                <div class={styles.userInfo}>
                  <div class={styles.userName}>
                    {userName(store.article?.user)}
                    <VerificationCheck user={store.article?.user} />
                  </div>
                  <Show when={store.article?.user.nip05}>
                    <div class={styles.nip05}>
                      {nip05Verification(store.article?.user)}
                    </div>
                  </Show>
                </div>
            </Show>
          </div>
        </A>

        <Show when={store.hasTiers}>
          <ButtonPrimary
            onClick={openSubscribe}
          >
            subscribe
          </ButtonPrimary>
        </Show>
      </div>

      <div class={styles.topBar}>
        <div class={styles.left}>
          <div class={styles.time}>
            {shortDate(store.article?.published)}
          </div>
          <Show when={store.article?.client}>
            <div class={styles.client}>
              via {store.article?.client}
            </div>
          </Show>
        </div>

        <div class={styles.right}>
          <BookmarkArticle note={store.article} />
          <NoteContextTrigger
            ref={articleContextMenu}
            onClick={onContextMenuTrigger}
          />
        </div>
      </div>

      <div id={`read_${naddr()}`} class={styles.longform}>
        <Show
          when={store.article}
          fallback={<Loader />}
        >
          <div class={styles.title}>
            {store.article?.title}
          </div>

          <Show when={(store.article?.image || '').length > 0}>
            <NoteImage
              class={`${styles.image} hero_image_${naddr()}`}
              src={store.article?.image}
              width={640}
            />
          </Show>

          <div class={styles.summary}>
            <div class={styles.border}></div>
            <div class={styles.text}>
              {store.article?.summary}
            </div>
          </div>

          <NoteTopZaps
            topZaps={store.article?.topZaps}
            zapCount={reactionsState.zapCount}
            users={store.users}
            action={() => {}}
          />

          <PrimalMarkdown
            noteId={props.naddr}
            content={store.article?.content || ''}
            readonly={true}
          />

          <div class={styles.tags}>
            <For each={store.article?.tags}>
              {tag => (
                <A href={`/reads/${tag}`} class={styles.tag}>
                  {tag}
                </A>
              )}
            </For>
          </div>
          {/* <div class={styles.content} innerHTML={inner()}>
             <SolidMarkdown
              children={note.content || ''}
            />
          </div> */}

          <div class={styles.footer}>
            <ArticleFooter
              note={store.article}
              state={reactionsState}
              updateState={updateReactionsState}
              customZapInfo={customZapInfo()}
              onZapAnim={addTopZapFeed}
            />
          </div>
        </Show>
      </div>

      <Show when={store.article}>
        <ReplyToNote
          note={store.article}
          onNotePosted={onReplyPosted}
        />
      </Show>

      <div>
        <For each={store.replies}>
          {reply => <Note note={reply} />}
        </For>
      </div>
    </>);
}

export default Longform;
