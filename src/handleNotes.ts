import { nip19 } from "nostr-tools";
import { Kind } from "./constants";
import { getEvents } from "./lib/feed";
import { setLinkPreviews } from "./lib/notes";
import { updateStore, store } from "./services/StoreService";
import { subscribeTo } from "./sockets";
import { convertToNotes } from "./stores/note";
import { account } from "./translations";
import { FeedPage, NostrEventContent, NostrEventType, NostrMentionContent, NostrNoteActionsContent, NostrNoteContent, NostrStatsContent, NostrUserContent, NoteActions, PrimalNote, TopZap } from "./types/primal";
import { parseBolt11 } from "./utils";

export const fetchNotes = (pubkey: string | undefined, noteIds: string[], subId: string) => {
  return new Promise<PrimalNote[]>((resolve, reject) => {
    if (!pubkey) reject('Missing pubkey');

    let note: PrimalNote;

    let page: FeedPage = {
      users: {},
      messages: [],
      postStats: {},
      mentions: {},
      noteActions: {},
      relayHints: {},
      topZaps: {},
      since: 0,
      until: 0,
    }

    let lastNote: PrimalNote | undefined;

    const unsub = subscribeTo(subId, (type, _, content) => {

      if (type === 'EOSE') {
        unsub();
        const notes = convertToNotes(page, page.topZaps);

        resolve(notes);
        return;
      }

      if (type === 'EVENT') {
        if (!content) return;
        updatePage(content);
      }
    });

    getEvents(pubkey, [...noteIds], subId, true);

    const updatePage = (content: NostrEventContent) => {
      if (content.kind === Kind.Metadata) {
        const user = content as NostrUserContent;
        console.log('USER: ', user);

        page.users[user.pubkey] = { ...user };

        return;
      }

      if ([Kind.Text, Kind.Repost].includes(content.kind)) {
        const message = content as NostrNoteContent;

        if (lastNote?.post?.noteId !== nip19.noteEncode(message.id)) {
          page.messages.push({...message});
        }

        return;
      }

      if (content.kind === Kind.NoteStats) {
        const statistic = content as NostrStatsContent;
        const stat = JSON.parse(statistic.content);
        page.postStats[stat.event_id] = { ...stat };

        return;
      }

      if (content.kind === Kind.Mentions) {
        const mentionContent = content as NostrMentionContent;
        const mention = JSON.parse(mentionContent.content);

        if (!page.mentions) {
          page.mentions = {};
        }

        page.mentions[mention.id] = { ...mention };

        return;
      }

      if (content.kind === Kind.NoteActions) {
        const noteActionContent = content as NostrNoteActionsContent;
        const noteActions = JSON.parse(noteActionContent.content) as NoteActions;

        page.noteActions[noteActions.event_id] = { ...noteActions };

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
        page.relayHints = { ...page.relayHints, ...hints };

        return;
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

        if (page.topZaps[eventId] === undefined) {
          page.topZaps[eventId] = [{ ...zap }];
          return;
        }

        if (page.topZaps[eventId].find(i => i.id === zap.id)) {
          return;
        }

        const newZaps = [ ...page.topZaps[eventId], { ...zap }].sort((a, b) => b.amount - a.amount);

        page.topZaps[eventId] = [ ...newZaps ];

        return;
      }

      if (content.kind === Kind.NoteQuoteStats) {
        const quoteStats = JSON.parse(content.content);


        // updateStore('quoteCount', () => quoteStats.count || 0);
        return;
      }
    };
  });
};