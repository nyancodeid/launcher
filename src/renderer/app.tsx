import { ipcRenderer } from 'electron';
import * as React from 'react';
import { AppRouter } from './router';
import { Redirect } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { LaunchboxData } from './LaunchboxData';
import { ISearchOnSearchEvent } from './components/Search';
import { TitleBar } from './components/TitleBar';
import { ICentralState } from './interfaces';
import * as AppConstants from '../shared/AppConstants';
import { IGameOrderChangeEvent } from './components/GameOrder';
import { IGameCollection } from '../shared/game/interfaces';
import { Paths } from './Paths';
import { BrowsePageLayout } from '../shared/BrowsePageLayout';
import { GameImageCollection } from './image/GameImageCollection';
import { GamePlaylistManager } from './playlist/GamePlaylistManager';

export interface IAppProps {
  history?: any;
}
export interface IAppState {
  central: ICentralState;
  search?: ISearchOnSearchEvent;
  order?: IGameOrderChangeEvent;
  logData: string;
  /** Scale of games at the browse page */
  gameScale: number;
  /** Layout of the browse page */
  gameLayout: BrowsePageLayout;
  /** If the custom titlebar is used */
  useCustomTitlebar: boolean;
}

export class App extends React.Component<IAppProps, IAppState> {
  private _onSearch: boolean = false;

  constructor(props: IAppProps) {
    super(props);
    // Normal constructor stuff
    const preferences = window.External.preferences;
    const config = window.External.config;
    this.state = {
      central: {
        gameImages: new GameImageCollection(config.fullFlashpointPath),
        playlists: new GamePlaylistManager(),
        gamesDoneLoading: false,
        playlistsDoneLoading: false,
        playlistsFailedLoading: false,
      },
      search: undefined,
      order: undefined,
      logData: '',
      gameScale: preferences.data.browsePageGameScale,
      gameLayout: preferences.data.browsePageLayout,
      useCustomTitlebar: config.data.useCustomTitlebar,
    };
    this.onSearch = this.onSearch.bind(this);
    this.onOrderChange = this.onOrderChange.bind(this);
    this.onScaleSliderChange = this.onScaleSliderChange.bind(this);
    this.onLayoutSelectorChange = this.onLayoutSelectorChange.bind(this);
    this.onLogDataUpdate = this.onLogDataUpdate.bind(this);
    this.onToggleSidebarClick = this.onToggleSidebarClick.bind(this);
    // Initialize app
    this.init();
  }

  init() {
    const config = window.External.config;
    // Listen for the window to move or resize (and update the preferences when it does)
    ipcRenderer.on('window-move', function(sender: any, x: number, y: number) {
      const mw = window.External.preferences.data.mainWindow;
      mw.x = x | 0;
      mw.y = y | 0;
    });
    ipcRenderer.on('window-resize', function(sender: any, width: number, height: number) {
      const mw = window.External.preferences.data.mainWindow;
      mw.width  = width  | 0;
      mw.height = height | 0;
    });
    // Load Playlists
    this.state.central.playlists.load()
    .catch((err) => {
      this.setState({
        central: Object.assign({}, this.state.central, {
          playlistsDoneLoading: true,
          playlistsFailedLoading: true,
        })
      });
      window.External.appendLogData(err.toString());
      throw err;
    })
    .then(() => {
      this.setState({
        central: Object.assign({}, this.state.central, {
          playlistsDoneLoading: true,
        })
      });
    });
    // Fetch LaunchBox game data from the xml
    LaunchboxData.fetchPlatformFilenames(config.fullFlashpointPath)
    .then((platformFilenames: string[]) => {
      // Prepare images
      const platforms: string[] = platformFilenames.map((platform) => platform.split('.')[0]); // ('Flash.xml' => 'Flash')
      this.state.central.gameImages.addPlatforms(platforms);
      // Fetch games
      LaunchboxData.fetchPlatforms(config.fullFlashpointPath, platformFilenames)
      .then((collection: IGameCollection) => {
        this.onDataLoaded(collection);
      })
      .catch((error) => {
        console.error(error);
        this.onDataLoaded();
      });
    })
    .catch((error) => {
      console.error(error);
      this.onDataLoaded();
    });
  }

  componentDidMount() {
    ipcRenderer.on('log-data-update', this.onLogDataUpdate);

    // Ask main to send us our first log-data-update msg.
    window.External.resendLogDataUpdate();
  }

  componentWillUnmount() {
    ipcRenderer.removeListener('log-data-update', this.onLogDataUpdate);
  }

  private onLogDataUpdate(event: any, fullLog: string) {
    this.setState({
      logData: fullLog,
    });
  }

  render() {
    // Check if a search was made - if so redirect to the browse page (this is a bit ghetto)
    let redirect = null;
    if (this._onSearch) {
      this._onSearch = false;
      redirect = <Redirect to={Paths.browse} push={true} />;
    }
    // Get game count (or undefined if no games are yet found)
    let gameCount: number|undefined;
    if (this.state.central.collection && this.state.central.collection.games) {
      gameCount = this.state.central.collection.games.length;
    }
    // Props to set to the router
    const routerProps = {
      central: this.state.central,
      search: this.state.search,
      order: this.state.order,
      logData: this.state.logData,
      gameScale: this.state.gameScale,
      gameLayout: this.state.gameLayout,
    };
    // Render
    return (
      <>
        {/* Redirect */}
        { redirect }
        {/* "TitleBar" stuff */}
        { this.state.useCustomTitlebar ? (
          <TitleBar title={`${AppConstants.appTitle} (${AppConstants.appVersionString})`} />
        ) : undefined }
        {/* "Header" stuff */}
        <Header onSearch={this.onSearch} onOrderChange={this.onOrderChange} 
                onToggleSidebarClick={this.onToggleSidebarClick} />
        {/* "Main" / "Content" stuff */}
        <div className='main'>
          <AppRouter {...routerProps} />
          <noscript className='nojs'>
            <div style={{textAlign:'center'}}>
              This website requires JavaScript to be enabled.
            </div>
          </noscript>
        </div>
        {/* "Footer" stuff */}
        <Footer gameCount={gameCount}
                onScaleSliderChange={this.onScaleSliderChange} scaleSliderValue={this.state.gameScale}
                onLayoutChange={this.onLayoutSelectorChange} layout={this.state.gameLayout} />
      </>
    );
  }

  /** Called when the Game Info has been fetched */
  private onDataLoaded(collection?: IGameCollection) {
    // Set the state
    this.setState({
      central: Object.assign({}, this.state.central, {
        collection: collection || { games: [], additionalApplications: [] },
        gamesDoneLoading: true,
      })
    });
  }

  private onSearch(event: ISearchOnSearchEvent): void {
    if (event.input || event.tags.length > 0) {
      this._onSearch = true;
    }
    this.setState({
      search: event,
    });
  }

  private onOrderChange(event: IGameOrderChangeEvent): void {
    this.setState({
      order: event,
    });
  }

  private onScaleSliderChange(value: number): void {
    this.setState({ gameScale: value });
    // Update Preferences Data (this is to make it get saved on disk)
    window.External.preferences.data.browsePageGameScale = value;
  }

  private onLayoutSelectorChange(value: BrowsePageLayout): void {
    this.setState({ gameLayout: value });
    // Update Preferences Data (this is to make it get saved on disk)
    window.External.preferences.data.browsePageLayout = value;
  }

  private onToggleSidebarClick(): void {
    const pref = window.External.preferences.data;
    pref.browsePageShowSidebar = !pref.browsePageShowSidebar;
    this.forceUpdate();
  }
}
