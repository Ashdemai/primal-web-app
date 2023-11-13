import { RouteDataFuncArgs, useNavigate, useParams, useRouteData } from '@solidjs/router';
import { nip19 } from 'nostr-tools';
import {
  Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Resource,
  Show,
  Switch
} from 'solid-js';
import Avatar from '../components/Avatar/Avatar';
import Branding from '../components/Branding/Branding';
import Note from '../components/Note/Note';
import { hexToNpub } from '../lib/keys';
import { humanizeNumber } from '../lib/stats';
import { authorName, nip05Verification, truncateNpub, userName } from '../stores/profile';
import Paginator from '../components/Paginator/Paginator';
import { useToastContext } from '../components/Toaster/Toaster';
import { useSettingsContext } from '../contexts/SettingsContext';
import { useProfileContext } from '../contexts/ProfileContext';
import { useAccountContext } from '../contexts/AccountContext';
import Wormhole from '../components/Wormhole/Wormhole';
import { useIntl } from '@cookbook/solid-intl';
import { urlify, sanitize, replaceLinkPreviews } from '../lib/notes';
import { shortDate } from '../lib/dates';

import styles from './Profile.module.scss';
import StickySidebar from '../components/StickySidebar/StickySidebar';
import ProfileSidebar from '../components/ProfileSidebar/ProfileSidebar';
import { MenuItem, VanityProfiles } from '../types/primal';
import PageTitle from '../components/PageTitle/PageTitle';
import FollowButton from '../components/FollowButton/FollowButton';
import Search from '../components/Search/Search';
import { useMediaContext } from '../contexts/MediaContext';
import { profile as t, actions as tActions, toast as tToast, feedProfile } from '../translations';
import Loader from '../components/Loader/Loader';
import PrimalMenu from '../components/PrimalMenu/PrimalMenu';
import ConfirmModal from '../components/ConfirmModal/ConfirmModal';
import { isAccountVerified, reportUser } from '../lib/profile';
import { APP_ID } from '../App';
import ProfileTabs from '../components/ProfileTabs/ProfileTabs';
import ButtonCopy from '../components/Buttons/ButtonCopy';
import ButtonProfile from '../components/Buttons/ButtonProfile';
import ButtonFollow from '../components/Buttons/ButtonFlip';
import ButtonSecondary from '../components/Buttons/ButtonSecondary';
import Menu from '../components/Menu/Menu';

const Profile: Component = () => {

  const settings = useSettingsContext();
  const toaster = useToastContext();
  const profile = useProfileContext();
  const account = useAccountContext();
  const media = useMediaContext();
  const intl = useIntl();
  const navigate = useNavigate();

  const params = useParams();

  const routeData = useRouteData<(opts: RouteDataFuncArgs) => Resource<VanityProfiles>>();

  const [showContext, setContext] = createSignal(false);
  const [confirmReportUser, setConfirmReportUser] = createSignal(false);
  const [confirmMuteUser, setConfirmMuteUser] = createSignal(false);

  const getHex = () => {
    if (params.vanityName && routeData()) {
      const name = params.vanityName.toLowerCase();
      const hex = routeData()?.names[name];

      if (hex) {
        return hex;
      }

      navigate('/404');
    }

    if (params.vanityName) {
      return '';
    }

    let hex = params.npub || account?.publicKey;

    if (params.npub?.startsWith('npub')) {
      hex = nip19.decode(params.npub).data as string;
    }

    return hex;
  }

  const setProfile = (hex: string | undefined) => {
    profile?.actions.setProfileKey(hex);

    profile?.actions.clearNotes();
    profile?.actions.clearReplies();
    profile?.actions.clearContacts();
    profile?.actions.clearZaps();
  }

  createEffect(() => {
    if (account?.isKeyLookupDone) {
      setProfile(getHex());
    }
  });

  const profileNpub = createMemo(() => {
    return hexToNpub(profile?.profileKey);
  });

  const profileName = () => {
    return profile?.userProfile?.displayName ||
      profile?.userProfile?.name ||
      truncateNpub(profileNpub());
  }

  const addToHome = () => {
    const feed = {
      name: intl.formatMessage(feedProfile, { name: profileName() }),
      hex: profile?.profileKey,
      npub: profileNpub(),
    };

    settings?.actions.addAvailableFeed(feed);
    toaster?.sendSuccess(intl.formatMessage(tToast.addFeedToHomeSuccess, { name: profileName()}));
  };

  const removeFromHome = () => {
    const feed = {
      name: intl.formatMessage(feedProfile, { name: profileName() }),
      hex: profile?.profileKey,
      npub: profileNpub(),
    };

    settings?.actions.removeAvailableFeed(feed);
    toaster?.sendSuccess(intl.formatMessage(tToast.removeFeedFromHomeSuccess, { name: profileName()}));
  };

  const hasFeedAtHome = () => {
    return !!settings?.availableFeeds.find(f => f.hex === profile?.profileKey);
  };

  const imgError = (event: any) => {
    const banner = document.getElementById('profile_banner');

    if (banner) {
      banner.innerHTML = `<div class="${styles.bannerPlaceholder}"></div>`;
    }

    return true;
  }

  const rectifyUrl = (url: string) => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `http://${url}`;
    }

    return url;
  }

  const onNotImplemented = () => {
    toaster?.notImplemented();
  }

  const isFollowingYou = () => {
    return profile?.isProfileFollowing;
  }

  const [isBannerCached, setisBannerCached] = createSignal(false);

  const banner = () => {
    const src= profile?.userProfile?.banner;
    const url = media?.actions.getMediaUrl(src, 'm', true);

    setisBannerCached(!!url);

    return url ?? src;
  }

  const flagBannerForWarning = () => {
    const dev = localStorage.getItem('devMode') === 'true';

    // @ts-ignore
    if (isBannerCached() || !dev) {
      return '';
    }

    return styles.cacheFlag;
  }

  const isCurrentUser = () => {
    if (!account || !profile || !account.isKeyLookupDone) {
      return false;
    }
    return account?.publicKey === profile?.profileKey;
  };

  createEffect(() => {
    const pk = getHex();

    if (!pk) {
      return;
    }

    if (account?.muted.includes(pk)) {
      profile?.actions.clearNotes();
    }
  });

  const isMuted = (pk: string | undefined, ignoreContentCheck = false) => {
    const isContentMuted = account?.mutelists.find(x => x.pubkey === account.publicKey)?.content;

    return pk &&
      account?.muted.includes(pk) &&
      (ignoreContentCheck ? true : isContentMuted);
  };

  const isFiltered = () => {
    return profile?.filterReason !== null;
  };

  const unMuteProfile = () => {
    if (!account || !profile?.profileKey) {
      return;
    }

    account.actions.removeFromMuteList(profile.profileKey, () => setProfile(profile.profileKey));
  };

  const isFollowingMute = (pk: string | undefined) => {
    if (!pk) return false;

    return account?.mutelists.find(l => l.pubkey === pk);
  };

  const followMute = () => {
    account?.actions.addFilterList(profile?.profileKey);
  };

  const unfollowMute = () => {
    account?.actions.removeFilterList(profile?.profileKey);
  };

  const openContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setContext(true);
  };

  const onClickOutside = (e: MouseEvent) => {
    if (
      !document?.getElementById('profile_context')?.contains(e.target as Node)
    ) {
      setContext(false);
    }
  }

  const profileContextForEveryone: () => MenuItem[] = () => {

    const addToFeedAction = hasFeedAtHome() ?
    {
      label: intl.formatMessage(tActions.profileContext.removeFeed),
      action: () => {
        removeFromHome();
        setContext(false);
      },
      icon: 'feed_remove',
    } :
    {
      label: intl.formatMessage(tActions.profileContext.addFeed),
      action: () => {
        addToHome();
        setContext(false);
      },
      icon: 'feed_add',
    };

    return [
      addToFeedAction,
      {
        label: intl.formatMessage(tActions.profileContext.copyLink),
        action: () => {
          copyProfileLink();
          setContext(false);
        },
        icon: 'copy_note_link',
      },
      {
        label: intl.formatMessage(tActions.profileContext.copyPubkey),
        action: () => {
          copyUserNpub();
          setContext(false);
        },
        icon: 'copy_pubkey',
      },
    ];
  };

  const profileContextForOtherPeople: () => MenuItem[] = () => {

    const muteAction = isMuted(getHex(), true) ?
      {
        label: intl.formatMessage(tActions.profileContext.unmuteUser),
        action: () => {
          unMuteProfile();
          setContext(false);
        },
        icon: 'mute_user',
        warning: true,
      } :
      {
        label: intl.formatMessage(tActions.profileContext.muteUser),
        action: () => {
          setConfirmMuteUser(true);
          setContext(false);
        },
        icon: 'mute_user',
        warning: true,
      };

    const followMuteAction = isFollowingMute(getHex()) ?
      {
        label: intl.formatMessage(tActions.profileContext.unfollowMute),
        action: () => {
          unfollowMute();
          setContext(false);
        },
        icon: 'mute_user',
      } :
      {
        label: intl.formatMessage(tActions.profileContext.followMute),
        action: () => {
          followMute();
          setContext(false);
        },
        icon: 'mute_user',
      };

    const separatorItem = {
      action: () => {},
      label: '',
      separator: true,
    }

    return [
      followMuteAction,
      separatorItem,
      muteAction,
      {
        label: intl.formatMessage(tActions.profileContext.reportUser),
        action: () => {
          setConfirmReportUser(true);
          setContext(false);
        },
        icon: 'report',
        warning: true,
      },
    ];
  };

  const profileContext = () => account?.publicKey !== getHex() ?
      [ ...profileContextForEveryone(), ...profileContextForOtherPeople()] :
      profileContextForEveryone();

  const doMuteUser = () => {
    const pk = getHex();
    pk && account?.actions.addToMuteList(pk);
  };

  const doReportUser = () => {
    const pk = getHex();

    if (!pk) {
      return;
    }

    reportUser(pk, `report_user_${APP_ID}`, profile?.userProfile);
    setContext(false);
    toaster?.sendSuccess(intl.formatMessage(tToast.noteAuthorReported, { name: userName(profile?.userProfile)}));
  };


  const addToAllowlist = async () => {
    const pk = getHex();
    if (pk) {
      account?.actions.addToAllowlist(pk, () => { setProfile(pk) });
    }
  };

  const copyProfileLink = () => {
    navigator.clipboard.writeText(`${window.location.href}`);
    setContext(false);
    toaster?.sendSuccess(intl.formatMessage(tToast.notePrimalLinkCoppied));
  };

  const copyUserNpub = () => {
    navigator.clipboard.writeText(`${hexToNpub(getHex())}`);
    setContext(false);
    toaster?.sendSuccess(intl.formatMessage(tToast.noteAuthorNpubCoppied));
  };

  const [renderProfileAbout, setRenderProfileAbout] = createSignal('');

  const getProfileAbout = (about: string) => {
    const a = urlify(sanitize(about), () => '', false, false, true);

    setRenderProfileAbout(a)
  };

  createEffect(() => {
    getProfileAbout(profile?.userProfile?.about || '');
  });

  createEffect(() => {
    if (showContext()) {
      document.addEventListener('click', onClickOutside);
    }
    else {
      document.removeEventListener('click', onClickOutside);
    }
  });

  const [verification, setVerification] = createSignal(false);

  const checkVerification = async (pubkey: string | undefined) => {
    if(!pubkey) {
      setVerification(false);
    }

    const v = await isAccountVerified(profile?.userProfile?.nip05);

    if (v && v.pubkey === pubkey) {
      setVerification(true);
      return;
    }

    setVerification(false);
  };

  createEffect(() => {
    if (profile?.profileKey) {
      checkVerification(profile?.profileKey)
    }
  })

  return (
    <>
      <PageTitle title={
        intl.formatMessage(
          t.title,
          {
            name: profile?.userProfile?.displayName ||
              profile?.userProfile?.name ||
              truncateNpub(profileNpub()),
          },
        )}
      />

      <StickySidebar>
        <ProfileSidebar notes={profile?.sidebar.notes} profile={profile?.userProfile} />
      </StickySidebar>

      <Wormhole to='search_section'>
        <Search />
      </Wormhole>

      <Show
        when={profile?.userProfile && profile.userProfile.pubkey === getHex()}
        fallback={<div id="central_header" class={styles.emptyHeader}></div>}
      >

        <div id="central_header" class={styles.fullHeader}>
          <div id="profile_banner" class={`${styles.banner} ${flagBannerForWarning()}`}>
            <Show
              when={profile?.userProfile?.banner}
              fallback={<div class={styles.bannerPlaceholder}></div>}
            >
              <img src={banner()} onerror={imgError}/>
            </Show>
          </div>

          <div class={styles.userImage}>
            <div class={styles.avatar}>
              <div class={styles.desktopAvatar}>
                <Avatar user={profile?.userProfile} size="xxl" zoomable={true} />
              </div>

              <div class={styles.phoneAvatar}>
                <Avatar user={profile?.userProfile} size="lg" zoomable={true} />
              </div>
            </div>
          </div>

          <div class={styles.profileActions}>
            <div class={styles.contextArea}>
              <ButtonSecondary
                onClick={openContextMenu}
                shrink={true}
              >
                <div class={styles.contextIcon}></div>
              </ButtonSecondary>
              <PrimalMenu
                id={'profile_context'}
                items={profileContext()}
                position="profile"
                reverse={true}
                hidden={!showContext()}
              />
            </div>

            <Show when={!isCurrentUser()}>
              <ButtonSecondary
                onClick={onNotImplemented}
                shrink={true}
              >
                <div class={styles.zapIcon}></div>
              </ButtonSecondary>
            </Show>

            <Show when={account?.publicKey}>
              <ButtonSecondary
                onClick={() => navigate(`/messages/${profile?.userProfile?.npub}`)}
                shrink={true}
              >
                <div class={styles.messageIcon}></div>
              </ButtonSecondary>
            </Show>

            <FollowButton person={profile?.userProfile} large={true} />

            <Show when={isCurrentUser()}>
              <div class={styles.editProfileButton}>
                <ButtonSecondary
                  onClick={() => navigate('/settings/profile')}
                  title={intl.formatMessage(tActions.editProfile)}
                >
                  <div>{intl.formatMessage(tActions.editProfile)}</div>
                </ButtonSecondary>
              </div>
            </Show>
          </div>

          <div class={styles.profileVerification}>
            <Show
              when={profile?.userProfile}>
              <div class={styles.basicInfo}>
                <div class={styles.name}>
                  {profileName()}
                  <Show when={profile?.userProfile?.nip05 && verification()}>
                    <div class={styles.verifiedIconL}></div>
                  </Show>
                  <Show when={isFollowingYou()}>
                    <div class={styles.followsBadge}>
                      {intl.formatMessage(t.followsYou)}
                    </div>
                  </Show>

                </div>

                <Show when={profile?.userStats.time_joined}>
                  <div class={styles.joined}>
                    {intl.formatMessage(
                      t.jointDate,
                      {
                        date: shortDate(profile?.userStats.time_joined),
                      },
                    )}
                  </div>
                </Show>
              </div>

              <div class={styles.verificationInfo}>
                <Show when={profile?.userProfile?.nip05}>
                  <div class={styles.verified}>
                    <div class={styles.nip05}>{nip05Verification(profile?.userProfile)}</div>
                  </div>
                </Show>
                <div class={styles.publicKey}>
                  <ButtonCopy
                    copyValue={profile?.userProfile?.npub || profileNpub()}
                    labelBeforeIcon={true}
                    label={truncateNpub(profile?.userProfile?.npub || profileNpub())}
                  />
                </div>
              </div>

            </Show>
          </div>

          <Show when={renderProfileAbout().length > 0}>
            <div class={styles.profileAbout} innerHTML={renderProfileAbout()}>
            </div>
          </Show>


          <Show when={profile?.userProfile?.website}>
            <div class={styles.profileLinks}>
              <div class={styles.website}>
                  <a href={rectifyUrl(profile?.userProfile?.website || '')} target="_blank">
                    {sanitize(profile?.userProfile?.website || '')}
                  </a>
              </div>
            </div>
          </Show>
        </div>

        <ProfileTabs profile={profile?.userProfile}/>

        <ConfirmModal
          open={confirmReportUser()}
          description={intl.formatMessage(tActions.reportUserConfirm, { name: userName(profile?.userProfile) })}
          onConfirm={() => {
            doReportUser();
            setConfirmReportUser(false);
          }}
          onAbort={() => setConfirmReportUser(false)}
        />

        <ConfirmModal
          open={confirmMuteUser()}
          description={intl.formatMessage(tActions.muteUserConfirm, { name: userName(profile?.userProfile) })}
          onConfirm={() => {
            doMuteUser();
            setConfirmMuteUser(false);
          }}
          onAbort={() => setConfirmMuteUser(false)}
        />
      </Show>
    </>
  )
}

export default Profile;
